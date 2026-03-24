import pymysql

# MySQL driver initialization
pymysql.install_as_MySQLdb()
pymysql.version_info = (2, 2, 7, "final", 0)
pymysql.__version__ = "2.2.7"
