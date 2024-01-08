from traitlets import Unicode
from jupyter_server.extension.application import ExtensionApp

from .handlers import SetConversationHandler


class ChatExtensionApp(ExtensionApp):
    # -------------- Required traits --------------
    name = "chatextension"

    # --- ExtensionApp traits you can configure ---

    # ----------- add custom traits below ---------
    pipe_path = Unicode(
        "/tmp/fuse_path_pipe", config=True, help="Path to the pipe for ipc"
    )
    data_path = Unicode("/mnt/data", config=True, help="Path to the data symlink")

    def initialize_settings(self):
        # Update the self.settings trait to pass extra
        # settings to the underlying Tornado Web Application.
        self.settings.update(
            {
                "chatextension": {
                    "pipe_path": self.pipe_path,
                    "data_path": self.data_path,
                }
            }
        )

    def initialize_handlers(self):
        # Extend the self.handlers trait
        self.handlers.extend([(r"/api/conversations/active", SetConversationHandler)])

    def initialize_templates(self):
        # Change the jinja templating environment
        pass

    async def stop_extension(self):
        # Perform any required shut down steps
        pass
