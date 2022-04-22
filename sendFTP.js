let fs = require('fs');
const moment = require("moment");
const sendFTP = require("basic-ftp");
var db = require('node-localdb');

var gps_filename = db('./gps_filename.json');

let mission = '';
let ftp_dir = '';

let ftp_client = null;
let ftp_host = process.argv[2];
let ftp_user = 'lx_ftp';
let ftp_pw = 'lx123!';

let geotagging_dir = 'Geotagged';
let geotagged_arr = [];

init();

function init() {
    read_mission();

    ftp_connect(ftp_host, ftp_user, ftp_pw);

    // setInterval(get_image_for_ftp, 2000);
    send_image_via_ftp();
}

function read_mission() {
    try {
        mission = gps_filename.findOne({name: 'mission_name'})._settledValue.mission;
        if (mission === undefined) {
            setTimeout(read_mission, 500);
        }
        ftp_dir = moment().format('YYYY-MM-DD') + '-' + mission;
        console.log('mission is ', mission);
        console.log('FTP directory is ' + ftp_dir);
    } catch (e) {
        if (e instanceof TypeError) {
            setTimeout(read_mission, 500);
        }
    }
}

async function ftp_connect(host, user, pw) {
    ftp_client = new sendFTP.Client(0)
    ftp_client.ftp.verbose = false;
    try {
        await ftp_client.access({
            host: host,
            user: user,
            password: pw,
            port: 50023
        })

        ftp_client.ensureDir("/" + ftp_dir);

        console.log('Connect FTP server to ' + host);
    } catch (err) {
        console.log('[FTP] Error\n', err)
        console.log('FTP connection failed');
    }
}

// function get_image_for_ftp() {
//     fs.readdir('./' + geotagging_dir + '/', (err, files) => {
//         files.forEach(file => {
//             if (file.includes('.jpg') || file.includes('.JPG')) {
//                 if (!geotagged_arr.includes(file)) {
//                     geotagged_arr.push(file);
//                 }
//             }
//         });
//     });
//
//     if (geotagged_arr.length > 0) {
//         setTimeout(send_image_via_ftp, 4000, geotagged_arr[0]);
//     }
// }

async function send_image_via_ftp() {
    try {
        fs.readdir('./' + geotagging_dir + '/', (err, files) => {
            if (err) {
            } else {
                files.forEach(file => {
                    if (file.includes('.jpg') || file.includes('.JPG')) {
                        if (!geotagged_arr.includes(file)) {
                            geotagged_arr.push(file);
                        }
                    }
                });
            }
        });

        if (geotagged_arr.length > 0) {
            await ftp_client.uploadFrom('./' + geotagging_dir + '/' + geotagged_arr[0], "/" + ftp_dir + '/' + geotagged_arr[0]).then(function () {
                setTimeout(move_image, 1000, './' + geotagging_dir + '/', './' + ftp_dir + '/', geotagged_arr[0]);
            });
            // let temp_arr = [];
            // fs.readdir('./' + ftp_dir + '/', (err, files) => {
            //     if (err) {
            //     } else {
            //         files.forEach(file => {
            //             if (file.includes('.jpg') || file.includes('.JPG')) {
            //                 if (!temp_arr.includes(file)) {
            //                     temp_arr.push(file);
            //                 }
            //             }
            //         });
            //         if (temp_arr.length === 100) {
            //             console.log('End Time : ', moment().format('YYYY-MM-DDTHH:mm:ss'));
            //         }
            //     }
            // });
        }
    } catch (e) {
    }
    setTimeout(send_image_via_ftp, 1000);
}

function move_image(from, to, image) {
    try {
        // fs.copyFile(from + image, to + image, (err) => {
        //     if (err) throw err;
        // });
        fs.renameSync(from + image, to + image);
        geotagged_arr.shift();
    } catch (e) {
        fs.stat(to + image, (err) => {
            console.log(err);
            if (err !== null && err.code === "ENOENT") {
                console.log("[sendFTP]사진이 존재하지 않습니다.");
            }
            console.log("[sendFTP]이미 처리 후 옮겨진 사진 (" + image + ") 입니다.");
        });
        geotagged_arr.shift();
    }
}

// const { result } = concurrently(['node capture.js', 'node geotagging.js', 'node ftp.js ' + ftp_info]);
