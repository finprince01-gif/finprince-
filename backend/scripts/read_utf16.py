def read_utf16(path):
    import codecs
    with codecs.open(path, 'r', 'utf-16') as f:
        print(f.read())

if __name__ == "__main__":
    import sys
    read_utf16('vouchers_columns.txt')
