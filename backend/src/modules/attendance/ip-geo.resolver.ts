import { Injectable } from '@nestjs/common';

export interface GeoPoint {
  lat: number;
  lng: number;
}

// Integration seam for IP-geolocation (IF-04). The default resolves nothing, so
// the ip_geo_mismatch signal never fires until a real provider is wired in. A
// tenant deployment swaps this provider for one that calls its chosen service.
@Injectable()
export class IpGeoResolver {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async resolve(ip: string | null | undefined): Promise<GeoPoint | null> {
    return null;
  }
}
