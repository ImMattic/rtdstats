# TODO

## Map Visualization
- [ ] Display fixed schematic map of all rail lines and Flatiron Flyer (FF) routes.
    - [ ] Evaluate Beck/Vignelli-style schematic vs. MapBox/Leaflet for implementation.
    - [ ] Show vehicle icons (rail cars, FF bus) moving along lines in real time.
    - [ ] Outline icons by frequency: green (≤15 min), orange (≤30 min), red (≥60 min), etc.
    - [ ] Update icon outlines dynamically as frequencies change by time/day.
    - [ ] On icon click, show dialog with:
        - [ ] Next stop
        - [ ] Expected time to next stop
        - [ ] On-time/late status (+/- x mins)
        - [ ] Table of the train car’s next stops (with times)
        - [ ] History icon for historical data

## Real-Time & Historical Data
- [ ] Store and serve historical vehicle position and timing data.
- [ ] Build UI to view historical performance for each line/vehicle.
- [ ] Allow download/export of historical data (CSV/JSON).
- [ ] Calculate and display on-time performance and other stats.

## Traffic Integration (FF Bus)
- [ ] Integrate Google Maps traffic API for FF buses.
    - [ ] Estimate arrival times at stops using current bus position and traffic data.

## Unofficial Alerts
- [ ] Detect and display alerts for vehicles stuck >5 minutes.
    - [ ] Integrate with Transit App API to confirm stuck status when GTFS-RT is unreliable.

## Dashboard & Analytics
- [ ] Build dashboard for:
    - [ ] On-time performance (priority)
    - [ ] Frequency stats
    - [ ] Delay incidents
    - [ ] (Brainstorm more: e.g., average trip time, most delayed segments, headway adherence, missed stops, etc.)

## Backend
- [ ] Refactor GTFS-RT ingestion to persist data in DB.
- [ ] Build REST/WebSocket API for:
    - [ ] Real-time vehicle positions
    - [ ] Historical data queries
    - [ ] Frequency calculations
    - [ ] Alerts and stats

## Frontend
- [ ] Implement map and dashboard UI.
- [ ] Connect to backend APIs for real-time and historical data.
- [ ] Responsive design for desktop/mobile.

## Testing & Reliability
- [ ] Add unit/integration tests for backend and frontend.
- [ ] Monitor GTFS-RT feed reliability; add fallback/alerting for outages.

## User Accounts
- [ ] No user accounts or authentication (explicitly out of scope).
