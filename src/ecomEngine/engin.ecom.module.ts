import { Module } from '@nestjs/common';
import { IntegrationProviderRegistry } from './registry/integration-provider.registry';

@Module({
  providers: [IntegrationProviderRegistry],

  exports: [IntegrationProviderRegistry],
})
export class EngineEcomModule {}
