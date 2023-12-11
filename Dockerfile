FROM quay.io/jupyter/base-notebook:latest

# Install packages to use for Code Interpretation
COPY requirements.txt /
RUN conda install -y --file /requirements.txt

# Temporarily switch to root to create and modify /mnt/data
USER root

# Create the /mnt/data directory
RUN mkdir -p /mnt/data

# Change the ownership of the /mnt/data directory to the jovyan user
# jovyan is the default user in Jupyter Docker images
RUN chown jovyan:users /mnt/data

# Set the appropriate permissions for the /mnt/data directory
# 770 grants full permissions (read, write, execute) to the owner (jovyan)
# and read-write permissions to the group (users)
RUN chmod 770 /mnt/data
