import importlib.util
import sys
import types
from pathlib import Path
from datetime import datetime

# Create a fake google.transit.gtfs_realtime_pb2 module so importing
# pb-decode.py won't fail if the real protobuf module isn't installed.
fake_google = types.ModuleType("google")
fake_transit = types.ModuleType("google.transit")
fake_gtfs = types.ModuleType("google.transit.gtfs_realtime_pb2")
fake_transit.gtfs_realtime_pb2 = fake_gtfs
fake_google.transit = fake_transit
sys.modules['google'] = fake_google
sys.modules['google.transit'] = fake_transit
sys.modules['google.transit.gtfs_realtime_pb2'] = fake_gtfs

# Load pb-decode.py (filename contains a hyphen so import by path)
pb_path = Path(__file__).resolve().parents[1] / "pb-decode.py"
spec = importlib.util.spec_from_file_location("pb_decode", str(pb_path))
pb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pb)


# Lightweight mocks to avoid depending on real protobuf classes
class MockPosition:
    def __init__(self, latitude, longitude, bearing=None):
        self.latitude = latitude
        self.longitude = longitude
        self.bearing = bearing


class MockTrip:
    def __init__(self, trip_id, route_id):
        self.trip_id = trip_id
        self.route_id = route_id


class MockVehicle:
    def __init__(self, label=None):
        self.label = label


class MockVehiclePosition:
    def __init__(self, trip=None, position=None, stop_id=None,
                 current_stop_sequence=0, current_status=None,
                 occupancy_status=None, occupancy_percentage=None,
                 timestamp=None, vehicle=None):
        self.trip = trip
        self.position = position or MockPosition(0.0, 0.0)
        self.stop_id = stop_id
        self.current_stop_sequence = current_stop_sequence
        self.current_status = current_status
        self.occupancy_status = occupancy_status
        self.occupancy_percentage = occupancy_percentage
        self.timestamp = timestamp
        self.vehicle = vehicle


class MockEntity:
    def __init__(self, vehicle=None):
        self.vehicle = vehicle
    def HasField(self, name):
        return name == "vehicle" and self.vehicle is not None


def test_format_line_info_basic():
    routes = {
        "R1": {
            "route_id": "R1",
            "route_short_name": "1",
            "route_long_name": "Line 1",
            "route_type": "3",
            "route_color": "FF0000",
        }
    }
    stops = {
        "S1": {
            "stop_id": "S1",
            "stop_name": "Stop 1",
            "stop_lat": 1.0,
            "stop_lon": 2.0,
        }
    }

    trip = MockTrip("trip-123", "R1")
    vehicle = MockVehicle(label="V123")
    pos = MockPosition(39.0, -104.0, bearing=90.0)
    vp = MockVehiclePosition(trip=trip, position=pos, stop_id="S1",
                             current_stop_sequence=5, current_status="IN_TRANSIT_TO",
                             occupancy_status=None, occupancy_percentage=None,
                             timestamp=1600000000, vehicle=vehicle)
    e = MockEntity(vehicle=vp)

    lines = pb.format_line_info([e], routes, stops)
    assert "R1" in lines
    v = lines["R1"]["vehicles"][0]
    assert v["trip_id"] == "trip-123"
    assert v["vehicle_label"] == "V123"
    assert v["position"]["latitude"] == 39.0
    assert v["position"]["longitude"] == -104.0
    assert v["current_stop"]["stop_id"] == "S1"
    assert v["occupancy_status"] == "UNKNOWN"
    assert v["timestamp"] == datetime.fromtimestamp(1600000000).isoformat()


def test_format_line_info_skips_no_route():
    # Vehicle with a trip but no route_id should be skipped
    trip = MockTrip("trip-1", None)
    vp = MockVehiclePosition(trip=trip)
    e = MockEntity(vehicle=vp)
    lines = pb.format_line_info([e], {}, {})
    assert lines == {}


def test_get_occupancy_summary_and_format_output():
    vehicles = [
        {"occupancy_status": "MANY_SEATS_AVAILABLE"},
        {"occupancy_status": "MANY_SEATS_AVAILABLE"},
        {"occupancy_status": "FULL"},
        {"occupancy_status": None},
    ]
    summary = pb.get_occupancy_summary(vehicles)
    assert summary["MANY_SEATS_AVAILABLE"] == 2
    assert summary["FULL"] == 1
    assert summary["UNKNOWN"] == 1

    # Test format_comprehensive_line_output mapping by type
    lines_data = {
        "R1": {
            "route_info": {"route_id": "R1", "route_short_name": "1", "route_long_name": "Line 1", "route_type": "3", "route_color": "FF0000"},
            "vehicles": vehicles
        }
    }
    out = pb.format_comprehensive_line_output(lines_data)
    assert "bus" in out
    assert "R1" in out["bus"]
    assert out["bus"]["R1"]["summary"]["total_vehicles"] == 4
