let fs = require('fs');
const piexif = require("piexifjs");
const moment = require("moment");
var db = require('node-localdb');

var gps_filename = db('./gps_filename.json');

let captured_arr = [];

let geotagging_dir = 'Geotagged';

init();

function init() {
    !fs.existsSync(geotagging_dir) && fs.mkdirSync(geotagging_dir);
    console.log('Create [Geotagged] directory..');
    // setInterval(get_image_for_geotagging, 2000);
    geotag_image();
}

function get_image_for_geotagging() {
    fs.readdir('./', (err, files) => {
        files.forEach(file => {
            if (file.includes('.jpg') || file.includes('.JPG')) {
                if (!captured_arr.includes(file)) {
                    captured_arr.push(file);
                }
            }
        });
    });

    if (captured_arr.length > 0) {
        setTimeout(geotag_image, 100, captured_arr[0]);
    }
}

function geotag_image() {
    try {
        fs.readdir('./', (err, files) => {
            if (err) {
                console.log('['+geotagging_dir+'] is empty directory..');
                // deal with it as you see fit
            } else {
                files.forEach(file => {
                    if (file.includes('.jpg') || file.includes('.JPG')) {
                        if (!captured_arr.includes(file)) {
                            captured_arr.push(file);
                        }
                    }
                });
            }
        });

        if (captured_arr.length > 0) {
            let jpeg = fs.readFileSync(captured_arr[0]);

            let data = jpeg.toString("binary");

            let exifObj = piexif.load(data);

            let gps = gps_filename.findOne({image: captured_arr[0]})._settledValue;

            exifObj.GPS[piexif.GPSIFD.GPSLatitude] = degToDmsRational(gps.lat / 100000000);
            exifObj.GPS[piexif.GPSIFD.GPSLongitude] = degToDmsRational(gps.lon / 100000000);
            exifObj.GPS[piexif.GPSIFD.GPSAltitude] = degToDmsRational(gps.relative_alt / 100);

            let exifbytes = piexif.dump(exifObj);

            let newData = piexif.insert(exifbytes, data);
            let newJpeg = Buffer.from(newData, "binary");
            fs.writeFileSync(captured_arr[0], newJpeg);
            setTimeout(move_image, 1000, './', './' + geotagging_dir + '/', captured_arr[0], 'geo');
        }
    } catch (e) {
        if (e instanceof TypeError) {
            let edit_file = moment(moment(captured_arr[0].substr(0, captured_arr[0].length - 4)).add("-1", "s")).format("YYYY-MM-DDTHH:mm:ss") + '.jpg';

            let jpeg = fs.readFileSync(captured_arr[0]);
            let data = jpeg.toString("binary");

            let exifObj = piexif.load(data);

            let gps = gps_filename.findOne({image: edit_file})._settledValue;

            exifObj.GPS[piexif.GPSIFD.GPSLatitude] = degToDmsRational(gps.lat / 100000000);
            exifObj.GPS[piexif.GPSIFD.GPSLongitude] = degToDmsRational(gps.lon / 100000000);
            exifObj.GPS[piexif.GPSIFD.GPSAltitude] = degToDmsRational(gps.relative_alt / 100);

            let exifbytes = piexif.dump(exifObj);

            let newData = piexif.insert(exifbytes, data);
            let newJpeg = Buffer.from(newData, "binary");
            fs.writeFileSync(captured_arr[0], newJpeg);
            setTimeout(move_image, 1000, './', './' + geotagging_dir + '/', captured_arr[0]);
        } else {
            // fs.stat('./' + geotagging_dir + '/' + captured_arr[0], (err) => {
            //     if (err !== null && err.code === "ENOENT") {
            //         console.log("[geotag_image] 사진이 존재하지 않습니다.");
            //     }
            //     console.log("[geotag_image] 이미 지오태깅된 사진 (" + captured_arr[0] + ") 입니다.");
            //     captured_arr.shift();
            // });
        }
    }
    setTimeout(geotag_image, 1000);
}

function degToDmsRational(degFloat) {
    let minFloat = degFloat % 1 * 60
    let secFloat = minFloat % 1 * 60
    let deg = Math.floor(degFloat)
    let min = Math.floor(minFloat)
    let sec = Math.round(secFloat * 100)

    deg = Math.abs(deg)
    min = Math.abs(min)
    sec = Math.abs(sec)

    return [[deg, 1], [min, 1], [sec, 100]]
}

function move_image(from, to, image) {
    try {
        fs.renameSync(from + image, to + image);
        captured_arr.shift();
    } catch (e) {
        fs.stat(to + image, (err) => {
            if (err !== null && err.code === "ENOENT") {
                console.log("[geotagging] 사진이 존재하지 않습니다.");
            }
            console.log("[geotagging] 이미 처리 후 옮겨진 사진 (" + image + ") 입니다.");
        });
        captured_arr.shift();
    }
}
