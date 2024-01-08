#!/usr/bin/env python
from __future__ import print_function, absolute_import, division
import os
import logging
from datetime import datetime
from argparse import ArgumentParser
from fuse import FUSE

from chatfuse.dynamic_operations import DynamicOperations
from chatfuse.subpath_updater import SubpathUpdater


def main():
    """
    The main entrypoint for the chatfuse command.
    """

    parser = ArgumentParser(
        description="A Dynamic Loopback FUSE filesystem that supports a configurable subpath and file filtering."
    )
    parser.add_argument(
        "--mount",
        default="/mnt/data",
        help="The mount point for the FUSE filesystem",
    )
    parser.add_argument(
        "--cache",
        default="/mnt/store",
        help="File cache location.",
    )
    parser.add_argument(
        "--pipe",
        default="/tmp/fuse",
        help="The pipe path to update the subpath through IPC.",
    )
    parser.add_argument(
        "--pipe-permissions",
        default=0o620,
        help="Optional file permissions for the FIFO pipe. Defaults to 0o620 (owner has full access and group can write, others cannot access).",
    )
    parser.add_argument(
        "--subpath",
        default="",
        help="The initial filesystem subpath to mount",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose logging",
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    os.makedirs(args.mount, exist_ok=True)

    def is_path_hidden(operations: DynamicOperations, path: str) -> bool:
        return (
            datetime.fromtimestamp(os.stat(path).st_mtime)
            < operations.last_subpath_update
        )

    operations = DynamicOperations(
        args.cache,
        args.subpath,
        lambda path: is_path_hidden(operations, path),
        prevent_hidden_path_conflicts=True,
    )

    def update_subpath(new_subpath: str) -> None:
        operations.subpath = new_subpath

    subpath_updater = SubpathUpdater(args.pipe, update_subpath, args.pipe_permissions)

    subpath_updater.start()

    try:
        FUSE(operations, args.mount, foreground=True, nothreads=True)
    except KeyboardInterrupt:
        print("\nUnmounting filesystem and stopping subpath updater...")
    finally:
        subpath_updater.stop()


if __name__ == "__main__":
    main()
