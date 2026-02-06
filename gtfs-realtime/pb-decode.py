import json
import csv
from pathlib import Path
from collections import defaultdict
from google.transit import gtfs_realtime_pb2
from datetime import datetime


# Load static GTFS data
def load_gtfs_static_data():
    """Load routes and stops from GTFS static files"""
    routes = {}
    stops = {}
    
    # Load routes from all transit types (combine purchased and operated)
    for transit_type in ["commuter_rail", "light_rail", "op_motorbus", "pur_motorbus", "pur_commuter_rail"]:
        routes_file = Path(f"../gtfs-static/{transit_type}/routes.txt")
        if routes_file.exists():
            with open(routes_file, 'r') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    routes[row['route_id']] = {
                        'route_id': row['route_id'],
                        'route_short_name': row['route_short_name'],
                        'route_long_name': row['route_long_name'],
                        'route_type': row['route_type'],
                        'route_color': row.get('route_color', ''),
                        'agency_id': row.get('agency_id', ''),
                    }
        
        # Load stops
        stops_file = Path(f"../gtfs-static/{transit_type}/stops.txt")
        if stops_file.exists():
            with open(stops_file, 'r') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    stops[row['stop_id']] = {
                        'stop_id': row['stop_id'],
                        'stop_name': row['stop_name'],
                        'stop_lat': float(row['stop_lat']),
                        'stop_lon': float(row['stop_lon']),
                    }
    
    return routes, stops


def format_line_info(entities, routes, stops):
    """
    Group real-time data by line and format as JSON
    
    Args:
        entities: List of GTFS-RT entities
        routes: Dictionary of route information
        stops: Dictionary of stop information
    
    Returns:
        Dictionary with line information grouped by route
    """
    lines_data = defaultdict(lambda: {
        'vehicles': [],
        'route_info': None
    })
    
    for entity in entities:
        # Vehicle position data contains both vehicle info and trip info
        if entity.HasField('vehicle'):
            vehicle_pos = entity.vehicle  # This is the VehiclePosition message
            trip_id = vehicle_pos.trip.trip_id if vehicle_pos.trip else None
            route_id = vehicle_pos.trip.route_id if vehicle_pos.trip else None
            
            if not route_id:
                continue
            
            # Get current stop information
            current_stop_info = None
            if vehicle_pos.stop_id and vehicle_pos.stop_id in stops:
                current_stop_info = stops[vehicle_pos.stop_id]
            
            vehicle_data = {
                'trip_id': trip_id,
                'vehicle_label': vehicle_pos.vehicle.label if vehicle_pos.vehicle else None,
                'position': {
                    'latitude': vehicle_pos.position.latitude,
                    'longitude': vehicle_pos.position.longitude,
                    'bearing': vehicle_pos.position.bearing if vehicle_pos.position.bearing else None,
                },
                'current_stop_sequence': vehicle_pos.current_stop_sequence,
                'current_status': vehicle_pos.current_status,
                'occupancy_status': vehicle_pos.occupancy_status if vehicle_pos.occupancy_status else 'UNKNOWN',
                'occupancy_percentage': vehicle_pos.occupancy_percentage if vehicle_pos.occupancy_percentage else None,
                'timestamp': datetime.fromtimestamp(vehicle_pos.timestamp).isoformat() if vehicle_pos.timestamp else None,
            }
            
            if current_stop_info:
                vehicle_data['current_stop'] = current_stop_info
            
            lines_data[route_id]['vehicles'].append(vehicle_data)
    
    # Add route information
    for route_id, line_data in lines_data.items():
        if route_id in routes:
            line_data['route_info'] = routes[route_id]
    
    return dict(lines_data)


def format_comprehensive_line_output(lines_data):
    """Format line data as human-readable JSON, separated by vehicle type"""
    
    # Vehicle type mappings
    VEHICLE_TYPES = {
        '0': 'light_rail',
        '1': 'heavy_rail',
        '2': 'commuter_rail',
        '3': 'bus',
    }
    
    # Initialize output by type
    output_by_type = {
        'bus': {},
        'light_rail': {},
        'heavy_rail': {},
        'commuter_rail': {},
        'other': {},
    }
    
    for route_id, line_data in lines_data.items():
        route_info = line_data['route_info'] or {}
        route_type = route_info.get('route_type', '')
        type_key = VEHICLE_TYPES.get(route_type, 'other')
        
        formatted_route = {
            'route': {
                'id': route_info.get('route_id', route_id),
                'short_name': route_info.get('route_short_name', ''),
                'long_name': route_info.get('route_long_name', ''),
                'type': route_info.get('route_type', ''),
                'color': route_info.get('route_color', ''),
            },
            'vehicles': line_data['vehicles'],
            'summary': {
                'total_vehicles': len(line_data['vehicles']),
                'occupancy_levels': get_occupancy_summary(line_data['vehicles']),
            }
        }
        
        output_by_type[type_key][route_id] = formatted_route
    
    return output_by_type


def get_occupancy_summary(vehicles):
    """Get summary of occupancy statuses"""
    occupancy_counts = defaultdict(int)
    for vehicle in vehicles:
        status = vehicle.get('occupancy_status') or 'UNKNOWN'
        occupancy_counts[status] += 1
    return dict(occupancy_counts)


# Main execution
if __name__ == "__main__":
    # Load static data
    routes, stops = load_gtfs_static_data()
    
    # Load real-time data
    feed = gtfs_realtime_pb2.FeedMessage()
    with open("VehiclePosition.pb", "rb") as f:
        feed.ParseFromString(f.read())
    
    # Process data
    lines_data = format_line_info(feed.entity, routes, stops)
    output_by_type = format_comprehensive_line_output(lines_data)
    
    # Output to separate files by type
    file_mappings = {
        'bus': 'output_buses.json',
        'light_rail': 'output_lr.json',
        'heavy_rail': 'output_hr.json',
        'commuter_rail': 'output_cr.json',
    }
    
    for type_name, filename in file_mappings.items():
        if output_by_type[type_name]:  # Only write if there's data
            with open(filename, 'w') as f:
                json.dump(output_by_type[type_name], f, indent=2)
            print(f"✓ Created {filename} with {len(output_by_type[type_name])} routes")
    
    # Print summary
    print("\n=== Summary ===")
    for type_name in ['bus', 'light_rail', 'heavy_rail', 'commuter_rail']:
        count = len(output_by_type[type_name])
        if count > 0:
            print(f"{type_name.upper()}: {count} routes")
    
    # Optional: Get info for a specific line
    # Example: python pb-decode.py R
    import sys
    if len(sys.argv) > 1:
        line_short_name = sys.argv[1]
        found = False
        for type_name, data in output_by_type.items():
            for route_id, line_info in data.items():
                if line_info['route']['short_name'] == line_short_name:
                    print(f"\n=== Line {line_short_name} Details ({type_name.upper()}) ===\n")
                    print(json.dumps(line_info, indent=2))
                    found = True
                    break
            if found:
                break
