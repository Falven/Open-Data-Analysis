#!/bin/bash

echo "Starting FUSE filesystem..."
/opt/chatfuse/main.py &
sleep 2

echo "Switching to non-root user and starting Jupyter server..."
su $NB_USER -c "\
source /opt/conda/etc/profile.d/conda.sh &&\
conda activate base &&\
start-notebook.py
"
