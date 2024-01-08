import os
import logging
import time
import threading
from typing import Callable

logger = logging.getLogger(__name__)


class SubpathUpdater:
    """
    A class to handle dynamic updates to a subpath using a FIFO pipe.
    """

    def __init__(
        self,
        pipe_path: str,
        update_callback: Callable[[str], None],
        pipe_permissions: int = 0o620,
    ) -> None:
        """
        Initialize the SubpathUpdater instance.

        :param pipe_path: The file system path to the FIFO pipe.
        :param update_callback: Callback function to handle new path updates.
        :param pipe_permissions: Optional file permissions for the FIFO pipe. Defaults to 0o620 (owner has full access and group can write, others cannot access).
        """
        self.pipe_path = pipe_path
        self.update_callback = update_callback
        self.pipe_permissions = pipe_permissions
        self.thread = threading.Thread(target=self.listen_for_updates)
        self.stop_listening = threading.Event()
        self._create_pipe()

    def _create_pipe(self) -> None:
        """
        Create the necessary directory structure and FIFO pipe.

        :raises OSError: If directory creation or FIFO pipe creation fails.
        """
        pipe_dir = os.path.dirname(self.pipe_path)
        if not os.path.exists(pipe_dir):
            try:
                os.makedirs(pipe_dir)
            except OSError as e:
                logger.error(f"Error creating directories for pipe path: {e}")
                raise

        if not os.path.exists(self.pipe_path):
            try:
                os.mkfifo(self.pipe_path, self.pipe_permissions)
            except OSError as e:
                logger.error(f"Error creating FIFO pipe: {e}")
                raise

    def _cleanup_resources(self) -> None:
        """
        Clean up resources by removing the FIFO pipe.
        """
        try:
            if os.path.exists(self.pipe_path):
                os.remove(self.pipe_path)
                logger.info(f"FIFO pipe at {self.pipe_path} removed successfully.")
        except OSError as e:
            logger.error(f"Error cleaning up FIFO pipe: {e}")

    def listen_for_updates(self) -> None:
        """
        Continuously listen for updates on the FIFO pipe and process them.
        """
        while not self.stop_listening.is_set():
            try:
                with open(self.pipe_path, "r") as pipe:
                    for line in pipe:
                        new_path = line.strip()
                        if new_path:
                            logger.info(f"-> SubpathUpdater {new_path}")
                            self.update_callback(new_path)
            except Exception as e:
                logger.error(f"Error in SubpathUpdater: {e}")
                time.sleep(5)
                self._create_pipe()

    def start(self) -> None:
        """
        Start the updater thread if it's not already running.
        """
        if not self.thread.is_alive():
            self.thread = threading.Thread(target=self.listen_for_updates)
            self.thread.start()

    def stop(self) -> None:
        """
        Stop the updater thread and clean up resources.
        """
        self.stop_listening.set()
        self.thread.join()
        self._cleanup_resources()
