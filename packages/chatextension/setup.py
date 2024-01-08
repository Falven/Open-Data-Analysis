from setuptools import setup

setup(
    # Name of the package
    name="chatextension",
    # Include data files specified in MANIFEST.in.
    include_package_data=True,
    # Additional files to be included in the installation.
    # chatextension.json configuration file should be installed to the etc/jupyter/jupyter_server_config.d directory,
    # a location for Jupyter server configuration files, automatically configuring the Jupyter Server to load extension.
    data_files=[
        (
            "etc/jupyter/jupyter_server_config.d",
            ["jupyter-config/jupyter_server_config.d/chatextension.json"],
        ),
    ],
)
