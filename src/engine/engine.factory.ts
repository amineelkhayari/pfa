import * as fs from 'fs';
import * as path from 'path';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PluginLoaderService, PluginType, IEnginePlugin, PluginManifest } from '../core/plugins';
import { BaileysPlugin } from '../plugins/engines/baileys';
import { createLogger } from '../common/services/logger.service';
import { BaileysMessageStoreService } from './adapters/baileys-message-store.service';
import { LidMappingStoreService } from './identity/lid-mapping-store.service';
import { isSafeSessionName } from '../common/utils/path-safety';
import { IWhatsAppEngine } from './interfaces/whatsapp-engine.interface';

export interface EngineCreateOptions {
  /** Session NAME — the on-disk auth-directory key (matches the dirs purgeSessionData removes). */
  sessionId: string;
  /** Session UUID (Session.id) — the DB-row key for FK-bound stores (e.g. baileys_stored_messages). */
  dbSessionId: string;
  proxyUrl?: string;
  proxyType?: 'http' | 'https' | 'socks4' | 'socks5';
}

@Injectable()
export class EngineFactory implements OnModuleInit {
  private readonly logger = createLogger('EngineFactory');
  private readonly engineType: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly pluginLoader: PluginLoaderService,
    private readonly baileysMessageStore: BaileysMessageStoreService,
    private readonly lidMappingStore: LidMappingStoreService,
  ) {
    this.engineType = this.configService.get<string>('engine.type') ?? 'baileys';
  }

  async onModuleInit(): Promise<void> {
    // Register built-in engine plugins
    await this.registerBuiltInEngines();
  }

  private async registerBuiltInEngines(): Promise<void> {
    // The engine config sub-tree (engine.* from configuration.ts) as an opaque blob. Supplied BOTH
    // to registerBuiltInPlugin (becomes context.config when onLoad runs) AND to each plugin's
    // constructor (A fallback so createEngine still has operator config if enablePlugin fails
    // before onLoad — otherwise sessionDataPath/executablePath/authDir would silently drop to defaults).
    const engineConfig = this.configService.get<Record<string, unknown>>('engine') ?? {};

    // Register Baileys as the built-in engine plugin.
    const baileysManifest: PluginManifest = {
      id: 'baileys',
      name: 'Baileys Engine',
      version: '1.0.0',
      type: PluginType.ENGINE,
      description: 'Baileys (WebSocket, no-browser) engine adapter',
      main: 'index.ts',
      provides: ['whatsapp-engine'],
    };
    this.pluginLoader.registerBuiltInPlugin(
      baileysManifest,
      new BaileysPlugin(this.baileysMessageStore, engineConfig, this.lidMappingStore),
      engineConfig,
    );

    // Auto-enable the configured engine
    try {
      await this.pluginLoader.enablePlugin(this.engineType);
      this.logger.log(`Engine plugin enabled: ${this.engineType}`, {
        action: 'engine_enabled',
        engineType: this.engineType,
      });
    } catch (error) {
      this.logger.error(
        `Failed to enable engine plugin: ${this.engineType}`,
        error instanceof Error ? error.message : String(error),
        { action: 'engine_enable_failed' },
      );
    }
  }

  create(options: EngineCreateOptions): IWhatsAppEngine {
    // The sessionId becomes the engine's on-disk auth-directory key (path.join(authDir, sessionId) /
    // session-${sessionId}), so a name containing '.', '/' or '\\' could traverse outside it. Normal
    // creation validates via CreateSessionDto, but alternate paths (data import, seed) can reach this
    // sink with a raw name — assert here so the traversal can never materialize regardless of source.
    if (!isSafeSessionName(options.sessionId)) {
      throw new Error(`Refusing to create an engine for an unsafe session name: ${JSON.stringify(options.sessionId)}`);
    }

    // Try to get engine from plugin system
    const enginePlugin = this.pluginLoader.getPlugin(this.engineType);

    if (enginePlugin?.instance && this.isEnginePlugin(enginePlugin.instance)) {
      // Engine-neutral per-call config only. Engine-specific config is supplied to the plugin as an
      // opaque blob via context.config at registration, so the factory never assembles engine-specific
      // fields.
      return enginePlugin.instance.createEngine({
        sessionId: options.sessionId,
        dbSessionId: options.dbSessionId,
        proxyUrl: options.proxyUrl,
        proxyType: options.proxyType,
      }) as IWhatsAppEngine;
    }

    this.logger.warn(`Engine plugin ${this.engineType} not available`, {
      action: 'engine_fallback',
    });

    throw new Error(`Engine '${this.engineType}' is unavailable; cannot start the session.`);
  }

  /**
   * Remove a session's persistent on-disk auth/store directories so deleting a session fully purges
   * its footprint. The dir is keyed by the session name and survives independently of any engine
   * instance. On delete the engine is frequently not even loaded (a stopped session has none), so the
   * paths are derived from config here rather than from a live adapter; otherwise recreating a
   * session under the same name would reload stale state.
   */
  async purgeSessionData(sessionName: string): Promise<void> {
    if (!isSafeSessionName(sessionName)) {
      // Same guard as create(): never let a name with '.', '/' or '\\' reach an rm -rf sink.
      this.logger.warn('Refusing to purge session data for an unsafe session name', {
        action: 'engine_purge_unsafe',
        sessionName: JSON.stringify(sessionName),
      });
      return;
    }
    const dirs: Array<{ engine: string; dir: string }> = [
      { engine: 'baileys', dir: this.baileysAuthDir(sessionName) },
    ];
    for (const { engine, dir } of dirs) {
      try {
        await fs.promises.rm(dir, { recursive: true, force: true });
        this.logger.log('Purged session auth directory', { action: 'engine_purge', engine, sessionName, dir });
      } catch (error) {
        this.logger.warn('Failed to purge session auth directory', {
          action: 'engine_purge_failed',
          engine,
          sessionName,
          dir,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * The on-disk auth directory Baileys keeps for `sessionName`: `path.join(authDir, name)`, with
   * authDir left unresolved, as the adapter does.
   */
  private baileysAuthDir(sessionName: string): string {
    const authDir = this.configService.get<string>('engine.baileys.authDir') ?? './data/baileys';
    return path.join(authDir, sessionName);
  }

  private isEnginePlugin(instance: unknown): instance is IEnginePlugin {
    return (
      typeof instance === 'object' &&
      instance !== null &&
      'type' in instance &&
      instance.type === PluginType.ENGINE &&
      'createEngine' in instance &&
      typeof (instance as { createEngine: unknown }).createEngine === 'function'
    );
  }

  getAvailableEngines(): Array<{
    id: string;
    name: string;
    enabled: boolean;
    features: string[];
    library?: { name: string; version: string };
  }> {
    const enginePlugins = this.pluginLoader.getPluginsByType(PluginType.ENGINE);

    return enginePlugins.map(plugin => {
      const inst = plugin.instance;
      const features = inst && this.isEnginePlugin(inst) ? inst.getFeatures() : [];
      // The real underlying library version (e.g. whatsapp-web.js 1.34.7), distinct from the
      // plugin's manifest version — so the dashboard can show which engine is actually running.
      const library = inst && this.isEnginePlugin(inst) ? inst.getEngineLibrary?.() : undefined;

      return {
        id: plugin.manifest.id,
        name: plugin.manifest.name,
        enabled: this.pluginLoader.isPluginEnabled(plugin.manifest.id),
        features,
        library,
      };
    });
  }

  getCurrentEngine(): string {
    return this.engineType;
  }
}
