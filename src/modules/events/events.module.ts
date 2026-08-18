import { Module, Global } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { AuthModule } from '../auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from '../session/entities/session.entity';

@Global()
@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Session], 'data')],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
