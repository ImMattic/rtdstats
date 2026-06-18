from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Decode RTD VehiclePosition protobuf into grouped JSON files.")
    parser.add_argument(
        "--pb-file",
        default=str(PROJECT_ROOT / "gtfs-realtime" / "VehiclePosition.pb"),
        help="Path to VehiclePosition protobuf file.",
    )
    parser.add_argument(
        "--gtfs-static-root",
        default=str(PROJECT_ROOT / "gtfs-static"),
        help="Path to GTFS static root directory.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(PROJECT_ROOT / "gtfs-realtime"),
        help="Directory to write grouped JSON outputs.",
    )
    parser.add_argument(
        "--print-summary",
        action="store_true",
        help="Print summary JSON to stdout.",
    )
    return parser.parse_args()


def main() -> int:
	from app.services.gtfs_decoder import decode_vehicle_positions, write_grouped_outputs

	args = parse_args()
	pb_file = Path(args.pb_file)
	gtfs_static_root = Path(args.gtfs_static_root)
	output_dir = Path(args.output_dir)

	if not pb_file.exists():
		print(f"error: protobuf file not found: {pb_file}")
		return 1

	output = decode_vehicle_positions(pb_file=pb_file, gtfs_static_root=gtfs_static_root)
	counts = write_grouped_outputs(output, output_dir)

	if args.print_summary:
		print(json.dumps({"counts": counts}, indent=2))
	else:
		for mode, count in sorted(counts.items()):
			print(f"wrote {mode}: {count} routes")

	return 0


if __name__ == "__main__":
    raise SystemExit(main())
