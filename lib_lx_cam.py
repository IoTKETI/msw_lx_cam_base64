#!/usr/bin/env python

# python-gphoto2 - Python interface to libgphoto2
# http://github.com/jim-easterbrook/python-gphoto2
# Copyright (C) 2015-19  Jim Easterbrook  jim@jim-easterbrook.me.uk
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

from __future__ import print_function

import logging
import os
import subprocess
import sys
import datetime

import gphoto2 as gp

import ftplib

camera = None


def action():
    global camera

    file_name = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=9)).strftime('%Y-%m-%dT%H:%M:%S.%f')

    logging.basicConfig(
        format='%(levelname)s: %(name)s: %(message)s', level=logging.WARNING)
    callback_obj = gp.check_result(gp.use_python_logging())
    camera = gp.Camera()
    camera.init()
    print('Capturing image')
    file_path = camera.capture(gp.GP_CAPTURE_IMAGE)
    print('Camera file path: {0}/{1}'.format(file_path.folder, file_path.name))
    target = os.path.join('./', file_name + '.jpg')
    print('Copying image to', target)
    camera_file = camera.file_get(
        file_path.folder, file_path.name, gp.GP_FILE_TYPE_NORMAL)
    camera_file.save('./image/' + target)

    # subprocess.call(['xdg-open', target])

    return target


def main():
    global camera

    ftp = ftplib.FTP()
    ftp.connect("203.253.128.177", 50023)
    ftp.login("d_keti", "keti123")

    # count = 0
    #
    # while (count < 10):
    #     target = action()
    #     sending_file = open(target, 'rb')
    #     ftp.storbinary('STOR ' + '/Downloads/ftp_test/' + target, sending_file)
    #     sending_file.close()
    #
    #     count += 1

    target = action()
    sending_file = open(target, 'rb')
    ftp.storbinary('STOR ' + '/Downloads/ftp_test/' + target, sending_file)
    sending_file.close()

    ftp.close
    camera.exit()



    return 0

if __name__ == "__main__":
    sys.exit(main())
