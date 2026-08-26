import { Module } from '@nestjs/common';
import { IntegrationProviderRegistry } from './integration-provider.registry';

@Module({
  providers: [IntegrationProviderRegistry],

  exports: [IntegrationProviderRegistry],
})
export class CommerceCoreModule {}
