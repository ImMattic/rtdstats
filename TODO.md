# TODO

## Map Visualization
- [ ] Display fixed schematic map of all rail lines and Flatiron Flyer (FF) routes.
    - [X] Evaluate Beck/Vignelli-style schematic vs. MapBox/Leaflet for implementation.
    - [X] Show vehicle icons (rail cars, FF bus) moving along lines in real time.
    - [X] Outline icons by frequency: green (≤15 min), orange (≤30 min), red (≥60 min), etc.
    - [X] Update icon outlines dynamically as frequencies change by time/day.
    - [X] On icon click, show dialog with:
        - [X] Next stop
        - [ ] Expected time to next stop
        - [X] On-time/late status (+/- x mins)
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

## Known Fixes
- [X] Outline the selected vehicle in white to improve visibility against the map background.
- [X] Remove vehicles with no average headway from Current Frequency list on the Dashboard
- [ ] Vehicle stuck logic still needs fixing so that it isn't included on the Stuck Vehicle Alerts if it is near one of its endpoints (e.g., Union Station for the A Line).
- [X] Remove duplicate "On time" tag from the Vehicle Dialog box
- [ ] Rework On-time logic to be more accurate
- [ ] Include link to schedule on RTD website in Vehicle Dialog box
- [ ] Include link to Greater Denver Transit blog posts on each bus and train line on the dialog box
- [X] Add Github repo button in the top right corner of the page
- [X] Don't show vehicles at Union Station (39.7531695197791, -105.00028537059949) until a certain zoom level is reached, since they are often stuck there and clutter the map
- [ ] Add search functionality to the map to allow users to search for a specific vehicle by its ID or route number
- [X] Update the 101C and 101T to be train lines since these are new service being run by RTD. Instead of 101C and 101T call them C and T, and update the icons to be train cars instead of buses. Also update the colors of the lines to match RTD's branding for these lines (C Line is #f79239, T Line is #b71318).
- [ ] Add stations to the map when you click on a vehicle, so that users can see where the vehicle is going and what stops it will make. The stations should be displayed as small circles on the map, with the station name displayed when you hover over the circle. The stations should also be color-coded to match the line that the vehicle is on (e.g., C Line stations should be orange, T Line stations should be red).
- [X] Add padding to the Stuck Vehicle Alert time tag on the row so that the See on Map icon doesn't move when the time changes
- [ ] Change the bus and train icons to look a bit more modern and visually appealing. The current icons are pretty basic and could be improved to make the map look nicer.
