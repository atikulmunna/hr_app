import { Module } from '@nestjs/common';
import { GeofenceService } from './geofence.service';
import { GeofencesController } from './geofences.controller';

@Module({
  controllers: [GeofencesController],
  providers: [GeofenceService],
  exports: [GeofenceService],
})
export class GeofenceModule {}
