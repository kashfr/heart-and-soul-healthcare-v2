'use client';

import { useState, useCallback } from 'react';
import { APIProvider, Map, AdvancedMarker, InfoWindow } from '@vis.gl/react-google-maps';
import styles from './ServiceAreaMap.module.css';

// Approximate center coordinates for each service county in Georgia
const serviceCounties = [
  // Primary Metro Atlanta Counties
  { name: 'Fulton', lat: 33.7901, lng: -84.4472, tier: 'primary' },
  { name: 'DeKalb', lat: 33.7715, lng: -84.2268, tier: 'primary' },
  { name: 'Cobb', lat: 33.9411, lng: -84.5761, tier: 'primary' },
  { name: 'Clayton', lat: 33.5408, lng: -84.3577, tier: 'primary' },
  { name: 'Henry', lat: 33.4530, lng: -84.1559, tier: 'primary' },
  { name: 'Gwinnett', lat: 33.9618, lng: -84.0232, tier: 'primary' },
  { name: 'Fayette', lat: 33.4139, lng: -84.4952, tier: 'primary' },
  { name: 'Douglas', lat: 33.7023, lng: -84.7519, tier: 'primary' },
  { name: 'Forsyth', lat: 34.2069, lng: -84.1254, tier: 'primary' },
  { name: 'Rockdale', lat: 33.6479, lng: -84.0179, tier: 'primary' },
  
  // Extended Service Counties
  { name: 'Cherokee', lat: 34.2445, lng: -84.4780, tier: 'secondary' },
  { name: 'Paulding', lat: 33.9211, lng: -84.8943, tier: 'secondary' },
  { name: 'Bartow', lat: 34.2349, lng: -84.8408, tier: 'secondary' },
  { name: 'Newton', lat: 33.5559, lng: -83.8579, tier: 'secondary' },
  { name: 'Spalding', lat: 33.2653, lng: -84.2835, tier: 'secondary' },
  { name: 'Coweta', lat: 33.3518, lng: -84.7619, tier: 'secondary' },
  { name: 'Carroll', lat: 33.5852, lng: -85.0829, tier: 'secondary' },
  { name: 'Barrow', lat: 33.9933, lng: -83.7114, tier: 'secondary' },
  { name: 'Gilmer', lat: 34.6907, lng: -84.4527, tier: 'secondary' },
  { name: 'Pickens', lat: 34.4644, lng: -84.4652, tier: 'secondary' },
];

// Office location
const officeLocation = {
  lat: 33.7872,
  lng: -84.3839,
  address: '1372 Peachtree St NE, Atlanta, GA 30309',
};

interface ServiceAreaMapProps {
  apiKey: string;
}

export default function ServiceAreaMap({ apiKey }: ServiceAreaMapProps) {
  const [selectedCounty, setSelectedCounty] = useState<typeof serviceCounties[0] | null>(null);
  const [showOfficeInfo, setShowOfficeInfo] = useState(false);

  const handleCountyClick = useCallback((county: typeof serviceCounties[0]) => {
    setSelectedCounty(county);
    setShowOfficeInfo(false);
  }, []);

  const handleOfficeClick = useCallback(() => {
    setShowOfficeInfo(true);
    setSelectedCounty(null);
  }, []);

  if (!apiKey) {
    return (
      <div className={styles.mapPlaceholder}>
        <div className={styles.placeholderContent}>
          <span className={styles.placeholderTitle}>Service Area Map</span>
          <p>Google Maps API key required</p>
          <p className={styles.placeholderNote}>Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env.local</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.mapContainer}>
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={{ lat: 33.85, lng: -84.35 }}
          defaultZoom={9}
          mapId="service-area-map"
          className={styles.map}
          gestureHandling="cooperative"
          disableDefaultUI={false}
          zoomControl={true}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={true}
        >
          {/* Office Marker */}
          <AdvancedMarker
            position={officeLocation}
            onClick={handleOfficeClick}
            title="Heart & Soul Healthcare Office"
          >
            <div className={styles.officeMarker}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
            </div>
          </AdvancedMarker>

          {/* County Markers */}
          {serviceCounties.map((county) => (
            <AdvancedMarker
              key={county.name}
              position={{ lat: county.lat, lng: county.lng }}
              onClick={() => handleCountyClick(county)}
              title={`${county.name} County`}
            >
              <div className={`${styles.countyMarker} ${styles[county.tier]}`}>
                <span>{county.name}</span>
              </div>
            </AdvancedMarker>
          ))}

          {/* Office Info Window */}
          {showOfficeInfo && (
            <InfoWindow
              position={officeLocation}
              onCloseClick={() => setShowOfficeInfo(false)}
            >
              <div className={styles.infoWindow}>
                <h4>Heart & Soul Healthcare</h4>
                <p>{officeLocation.address}</p>
                <p className={styles.infoPhone}>(678) 644-0337</p>
              </div>
            </InfoWindow>
          )}

          {/* County Info Window */}
          {selectedCounty && (
            <InfoWindow
              position={{ lat: selectedCounty.lat, lng: selectedCounty.lng }}
              onCloseClick={() => setSelectedCounty(null)}
            >
              <div className={styles.infoWindow}>
                <h4>{selectedCounty.name} County</h4>
                <p>
                  {selectedCounty.tier === 'primary' 
                    ? '✓ Primary Service Area' 
                    : '✓ Extended Service Area'}
                </p>
                <p className={styles.infoNote}>Home health services available</p>
              </div>
            </InfoWindow>
          )}
        </Map>
      </APIProvider>

      {/* Legend */}
      <div className={styles.legend}>
        <h4>Service Areas</h4>
        <div className={styles.legendItems}>
          <div className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.office}`}></span>
            <span>Our Office</span>
          </div>
          <div className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.primary}`}></span>
            <span>Primary Service (10 counties)</span>
          </div>
          <div className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.secondary}`}></span>
            <span>Extended Service (10 counties)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
