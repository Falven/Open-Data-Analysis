import json
import os
from jupyter_server.base.handlers import JupyterHandler
from jupyter_server.extension.handler import ExtensionHandlerMixin
from tornado.web import authenticated, HTTPError


class SetConversationHandler(ExtensionHandlerMixin, JupyterHandler):
    def initialize_handlers(self):
        self.handlers.extend([(r"/api/conversations/active", SetConversationHandler)])

    @authenticated
    def post(self):
        conversation_id = json.loads(self.request.body.decode("utf-8")).get(
            "conversationId"
        )
        if not conversation_id:
            raise HTTPError(400, "conversationId is required")

        pipe_path = self.settings["chatextension"]["pipe_path"]
        data_path = self.settings["chatextension"]["data_path"]
        new_path = os.path.join(data_path, f"conversations/{conversation_id}/")

        with open(pipe_path, "w") as pipe:
            pipe.write(new_path + "\n")

        self.finish(json.dumps({"status": "success"}))
