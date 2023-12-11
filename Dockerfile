FROM quay.io/jupyter/base-notebook:latest

# Install packages to use for Code Interpretation
COPY requirements.txt /
RUN conda install -y --file /requirements.txt
