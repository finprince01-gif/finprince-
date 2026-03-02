import pymysql

# Use PyMySQL as MySQL driver (alternative to mysqlclient)
pymysql.install_as_MySQLdb()

# Patch version check for Django 6.0 compatibility
pymysql.version_info = (2, 2, 7, "final", 0)
pymysql.__version__ = "2.2.7"
