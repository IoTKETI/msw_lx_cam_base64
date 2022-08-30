const fs = require('fs');
const fsextra = require('fs-extra');
const moment = require("moment");
const axios = require("axios");
const {nanoid} = require("nanoid");
const mqtt = require("mqtt");
const {spawn} = require('child_process');

const my_lib_name = 'lib_lx_cam';

let mission = '';
let sended_dir = 'SendTest';
let drone_name = 'drone1';
let host = 'gcs.iotocean.org';

let geotagging_dir = 'Test';

let lib = {};

let lib_mqtt_client = null;
let my_status_topic = '';
let control_topic = '';

let status = 'Start';
let count = 0;
let external_memory = '/media/pi/';
let copyable = false;

let empty_count = 0;
let images = []

let imgList_first = [];
let imgList_second = [];
let imgList_third = [];
let imgList_forth = [];
let imgList_fifth = [];

function send_image() {
    try {
        fs.readdir('./' + geotagging_dir + '/', (err, files) => {
            if (err) {
                console.log(err);
                setTimeout(send_image, 50);
            } else {
                if (files.length > 0) {
                    if (files.hasOwnProperty(0)) {
                        let nameArr0 = files[0].split('_')
                        let index0 = nameArr0[nameArr0.length - 1].split('.')[0]
                        if (parseInt(index0) % 5 === 0) {
                            if (!imgList_first.includes(files[0])) {
                                imgList_first.push(files[0])
                                console.log(imgList_first)
                            }
                        } else if (parseInt(index0) % 5 === 1) {
                            if (!imgList_second.includes(files[0])) {
                                imgList_second.push(files[0])
                                console.log(imgList_second)
                            }
                        } else if (parseInt(index0) % 5 === 2) {
                            if (!imgList_third.includes(files[0])) {
                                imgList_third.push(files[0])
                                console.log(imgList_third)
                            }
                        } else if (parseInt(index0) % 5 === 3) {
                            if (!imgList_forth.includes(files[0])) {
                                imgList_forth.push(files[0])
                                console.log(imgList_forth)
                            }
                        } else if (parseInt(index0) % 5 === 4) {
                            if (!imgList_fifth.includes(files[0])) {
                                imgList_fifth.push(files[0])
                                console.log(imgList_fifth)
                            }
                        }
                    }

                    if (files.hasOwnProperty(1)) {
                        let nameArr1 = files[1].split('_')
                        let index1 = nameArr1[nameArr1.length - 1].split('.')[0]
                        if (parseInt(index1) % 5 === 0) {
                            if (!imgList_first.includes(files[1])) {
                                imgList_first.push(files[1])
                                console.log(imgList_first)
                            }
                        } else if (parseInt(index1) % 5 === 1) {
                            if (!imgList_second.includes(files[1])) {
                                imgList_second.push(files[1])
                                console.log(imgList_second)
                            }
                        } else if (parseInt(index1) % 5 === 2) {
                            if (!imgList_third.includes(files[1])) {
                                imgList_third.push(files[1])
                                console.log(imgList_third)
                            }
                        } else if (parseInt(index1) % 5 === 3) {
                            if (!imgList_forth.includes(files[1])) {
                                imgList_forth.push(files[1])
                                console.log(imgList_forth)
                            }
                        } else if (parseInt(index1) % 5 === 4) {
                            if (!imgList_fifth.includes(files[1])) {
                                imgList_fifth.push(files[1])
                                console.log(imgList_fifth)
                            }
                        }
                    }

                    if (files.hasOwnProperty(2)) {
                        let nameArr2 = files[2].split('_')
                        let index2 = nameArr2[nameArr2.length - 1].split('.')[0]
                        if (parseInt(index2) % 5 === 0) {
                            if (!imgList_first.includes(files[2])) {
                                imgList_first.push(files[2])
                                console.log(imgList_first)
                            }
                        } else if (parseInt(index2) % 5 === 1) {
                            if (!imgList_second.includes(files[2])) {
                                imgList_second.push(files[2])
                                console.log(imgList_second)
                            }
                        } else if (parseInt(index2) % 5 === 2) {
                            if (!imgList_third.includes(files[2])) {
                                imgList_third.push(files[2])
                                console.log(imgList_third)
                            }
                        } else if (parseInt(index2) % 5 === 3) {
                            if (!imgList_forth.includes(files[2])) {
                                imgList_forth.push(files[2])
                                console.log(imgList_forth)
                            }
                        } else if (parseInt(index2) % 5 === 4) {
                            if (!imgList_fifth.includes(files[2])) {
                                imgList_fifth.push(files[2])
                                console.log(imgList_fifth)
                            }
                        }
                    }

                    if (files.hasOwnProperty(3)) {
                        let nameArr3 = files[3].split('_')
                        let index3 = nameArr3[nameArr3.length - 1].split('.')[0]
                        if (parseInt(index3) % 5 === 0) {
                            if (!imgList_first.includes(files[3])) {
                                imgList_first.push(files[3])
                                console.log(imgList_first)
                            }
                        } else if (parseInt(index3) % 5 === 1) {
                            if (!imgList_second.includes(files[3])) {
                                imgList_second.push(files[3])
                                console.log(imgList_second)
                            }
                        } else if (parseInt(index3) % 5 === 2) {
                            if (!imgList_third.includes(files[3])) {
                                imgList_third.push(files[3])
                                console.log(imgList_third)
                            }
                        } else if (parseInt(index3) % 5 === 3) {
                            if (!imgList_forth.includes(files[3])) {
                                imgList_forth.push(files[3])
                                console.log(imgList_forth)
                            }
                        } else if (parseInt(index3) % 5 === 4) {
                            if (!imgList_fifth.includes(files[3])) {
                                imgList_fifth.push(files[3])
                                console.log(imgList_fifth)
                            }
                        }
                    }

                    if (files.hasOwnProperty(4)) {
                        let nameArr4 = files[4].split('_')
                        let index4 = nameArr4[nameArr4.length - 1].split('.')[0]
                        if (parseInt(index4) % 5 === 0) {
                            if (!imgList_first.includes(files[4])) {
                                imgList_first.push(files[4])
                                console.log(imgList_first)
                            }
                        } else if (parseInt(index4) % 5 === 1) {
                            if (!imgList_second.includes(files[4])) {
                                imgList_second.push(files[4])
                                console.log(imgList_second)
                            }
                        } else if (parseInt(index4) % 5 === 2) {
                            if (!imgList_third.includes(files[4])) {
                                imgList_third.push(files[4])
                                console.log(imgList_third)
                            }
                        } else if (parseInt(index4) % 5 === 3) {
                            if (!imgList_forth.includes(files[4])) {
                                imgList_forth.push(files[4])
                                console.log(imgList_forth)
                            }
                        } else if (parseInt(index4) % 5 === 4) {
                            if (!imgList_fifth.includes(files[4])) {
                                imgList_fifth.push(files[4])
                                console.log(imgList_fifth)
                            }
                        }
                    }
                } else {
                    if (status === 'Started') {
                        empty_count++;
                        // console.log('Waiting - ' + empty_count);
                        if (empty_count > 200) {
                            console.timeEnd('Finish')
                            status = 'Finish';
                            empty_count = 0;
                            let msg = status + ' ' + count;
                            lib_mqtt_client.publish(my_status_topic, msg);
                        } else {
                            setTimeout(send_image, 50);
                            return
                        }
                    } else {
                        setTimeout(send_image, 100);
                        return
                    }
                }
                setTimeout(send_image, 50);
            }
        });
    } catch (e) {
        setTimeout(send_image, 100);
        return
    }
}

function SendBase64_0() {
    if (imgList_first.length > 0) {
        try {
            console.time('Cycle0')
            console.time('OnlySend0')
            let readFile = fs.readFileSync('./' + geotagging_dir + '/' + imgList_first[0]); //이미지 파일 읽기
            let encode = Buffer.from(readFile).toString('base64'); //파일 인코딩
            let header = {
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            };
            axios.post("http://" + host + ":4500/images",
                {
                    imageid: imgList_first[0].slice(0, 19) + '.jpg',
                    content: "data:image/jpg;base64," + encode,
                },
                header
            ).then(function (response) {
                console.timeEnd('OnlySend0')
                images.push(imgList_first[0].slice(0, 19) + '.jpg')
                axios.put("http://" + host + ":4500/lists/listid/" + sended_dir,
                    {content: images}
                ).then(function (response) {
                    move_image('./' + geotagging_dir + '/' + imgList_first[0], './' + sended_dir + '/' + imgList_first[0].slice(0, 19) + '.jpg')
                        .then((result) => {
                            if (result === 'finish') {
                                count++;

                                empty_count = 0;
                                let msg = status + ' ' + count + ' ' + imgList_first[0].slice(0, 19) + '.jpg';
                                lib_mqtt_client.publish(my_status_topic, msg);
                                console.timeEnd("Cycle0");
                                imgList_first.shift()
                                setTimeout(SendBase64_0, 100);
                                return
                            } else {
                                console.timeEnd("Cycle0");
                                setTimeout(SendBase64_0, 100);
                                return
                            }
                        }).catch((error) => {
                        // console.log(error);
                        fs.stat('./' + sended_dir + '/' + imgList_first[0], (err) => {
                            // console.log(err);
                            if (err !== null && err.code === "ENOENT") {
                                console.log("[sendImages]사진이 존재하지 않습니다.");
                            }
                            console.timeEnd('Cycle0')
                            console.timeEnd('OnlySend0')
                            console.log("[sendImages]이미 처리 후 옮겨진 사진 (" + imgList_first[0] + ") 입니다.");
                        });
                        setTimeout(SendBase64_0, 100);
                        return
                    });
                }).catch((error) => {
                    console.log('[list_update]', error.message)
                    setTimeout(SendBase64_0, 100);
                    return
                })
            }).catch(function (error) {
                console.log('[image_send]', error.message)
                setTimeout(SendBase64_0, 100);
                return
            });
        } catch (e) {
            imgList_first.shift()
            setTimeout(SendBase64_0, 100);
        }
    } else {
        setTimeout(SendBase64_0, 100);
    }
}

function SendBase64_1() {
    if (imgList_second.length > 0) {
        try {
            console.time('Cycle1')
            console.time('OnlySend1')
            let readFile = fs.readFileSync('./' + geotagging_dir + '/' + imgList_second[0]); //이미지 파일 읽기
            let encode = Buffer.from(readFile).toString('base64'); //파일 인코딩
            let header = {
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            };
            axios.post("http://" + host + ":4500/images",
                {
                    imageid: imgList_second[0].slice(0, 19) + '.jpg',
                    content: "data:image/jpg;base64," + encode,
                },
                header
            ).then(function (response) {
                console.timeEnd('OnlySend1')
                images.push(imgList_second[0].slice(0, 19) + '.jpg')
                axios.put("http://" + host + ":4500/lists/listid/" + sended_dir,
                    {content: images}
                ).then(function (response) {
                    move_image('./' + geotagging_dir + '/' + imgList_second, './' + sended_dir + '/' + imgList_second[0].slice(0, 19) + '.jpg')
                        .then((result) => {
                            if (result === 'finish') {
                                count++;

                                empty_count = 0;
                                let msg = status + ' ' + count + ' ' + imgList_second[0].slice(0, 19) + '.jpg';
                                lib_mqtt_client.publish(my_status_topic, msg);
                                console.timeEnd("Cycle1");
                                imgList_second.shift()

                                setTimeout(SendBase64_1, 100);
                                return
                            } else {
                                console.timeEnd("Cycle1");
                                setTimeout(SendBase64_1, 100);
                                return
                            }
                        }).catch((error) => {
                        // console.log(error);
                        fs.stat('./' + sended_dir + '/' + imgList_second[0], (err) => {
                            // console.log(err);
                            if (err !== null && err.code === "ENOENT") {
                                console.log("[sendImages]사진이 존재하지 않습니다.");
                            }
                            console.timeEnd('Cycle1')
                            console.timeEnd('OnlySend1')
                            console.log("[sendImages]이미 처리 후 옮겨진 사진 (" + imgList_second[0] + ") 입니다.");
                        });
                        setTimeout(SendBase64_1, 100);
                        return
                    });
                }).catch((error) => {
                    console.log('[list_update]', error.message)
                    setTimeout(SendBase64_1, 100);
                    return
                })
            }).catch(function (error) {
                console.log('[image_send]', error.message)
                setTimeout(SendBase64_1, 100);
                return
            });
        } catch (e) {
            imgList_second.shift()
            setTimeout(SendBase64_1, 100);
        }
    } else {
        setTimeout(SendBase64_1, 100);
    }
}

function SendBase64_2() {
    if (imgList_third.length > 0) {
        try {
            console.time('Cycle2')
            console.time('OnlySend2')
            let readFile = fs.readFileSync('./' + geotagging_dir + '/' + imgList_third[0]); // 이미지 파일 읽기
            let encode = Buffer.from(readFile).toString('base64'); // 파일 인코딩
            let header = {
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            };
            axios.post("http://" + host + ":4500/images",
                {
                    imageid: imgList_third[0].slice(0, 19) + '.jpg',
                    content: "data:image/jpg;base64," + encode,
                },
                header
            ).then(function (response) {
                console.timeEnd('OnlySend2')
                images.push(imgList_third[0].slice(0, 19) + '.jpg')
                axios.put("http://" + host + ":4500/lists/listid/" + sended_dir,
                    {content: images}
                ).then(function (response) {
                    move_image('./' + geotagging_dir + '/' + imgList_third[0], './' + sended_dir + '/' + imgList_third[0].slice(0, 19) + '.jpg')
                        .then((result) => {
                            if (result === 'finish') {
                                count++;

                                empty_count = 0;
                                let msg = status + ' ' + count + ' ' + imgList_third[0].slice(0, 19) + '.jpg';
                                lib_mqtt_client.publish(my_status_topic, msg);
                                console.timeEnd("Cycle2");
                                imgList_third.shift()
                                setTimeout(SendBase64_2, 100);
                                return
                            } else {
                                console.timeEnd("Cycle2");
                                setTimeout(SendBase64_2, 100);
                                return
                            }
                        }).catch((error) => {
                        // console.log(error);
                        fs.stat('./' + sended_dir + '/' + imgList_third[0], (err) => {
                            // console.log(err);
                            if (err !== null && err.code === "ENOENT") {
                                console.log("[sendImages]사진이 존재하지 않습니다.");
                            }
                            console.timeEnd('Cycle2')
                            console.timeEnd('OnlySend2')
                            console.log("[sendImages]이미 처리 후 옮겨진 사진 (" + imgList_third[0] + ") 입니다.");
                        });
                        setTimeout(SendBase64_2, 100);
                        return
                    });
                }).catch((error) => {
                    console.log('[list_update]', error.message)
                    setTimeout(SendBase64_2, 100);
                    return
                })
            }).catch(function (error) {
                console.log('[image_send]', error.message)
                setTimeout(SendBase64_2, 100);
                return
            });
        } catch (e) {
            imgList_third.shift()
            setTimeout(SendBase64_2, 100);
        }
    } else {
        setTimeout(SendBase64_2, 100);
    }
}

function SendBase64_3() {
    if (imgList_forth.length > 0) {
        try {
            console.time('Cycle3')
            console.time('OnlySend3')
            let readFile = fs.readFileSync('./' + geotagging_dir + '/' + imgList_forth[0]); // 이미지 파일 읽기
            let encode = Buffer.from(readFile).toString('base64'); // 파일 인코딩
            let header = {
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            };
            axios.post("http://" + host + ":4500/images",
                {
                    imageid: imgList_forth[0].slice(0, 19) + '.jpg',
                    content: "data:image/jpg;base64," + encode,
                },
                header
            ).then(function (response) {
                console.timeEnd('OnlySend3')
                images.push(imgList_forth[0].slice(0, 19) + '.jpg')
                axios.put("http://" + host + ":4500/lists/listid/" + sended_dir,
                    {content: images}
                ).then(function (response) {
                    move_image('./' + geotagging_dir + '/' + imgList_forth[0], './' + sended_dir + '/' + imgList_forth[0].slice(0, 19) + '.jpg')
                        .then((result) => {
                            if (result === 'finish') {
                                count++;

                                empty_count = 0;
                                let msg = status + ' ' + count + ' ' + imgList_forth[0].slice(0, 19) + '.jpg';
                                lib_mqtt_client.publish(my_status_topic, msg);
                                console.timeEnd("Cycle3");
                                imgList_forth.shift()
                                setTimeout(SendBase64_3, 100);
                                return
                            } else {
                                console.timeEnd("Cycle3");
                                setTimeout(SendBase64_3, 100);
                                return
                            }
                        }).catch((error) => {
                        // console.log(error);
                        fs.stat('./' + sended_dir + '/' + imgList_forth[0], (err) => {
                            // console.log(err);
                            if (err !== null && err.code === "ENOENT") {
                                console.log("[sendImages]사진이 존재하지 않습니다.");
                            }
                            console.timeEnd('Cycle3')
                            console.timeEnd('OnlySend3')
                            console.log("[sendImages]이미 처리 후 옮겨진 사진 (" + imgList_forth[0] + ") 입니다.");
                        });
                        setTimeout(SendBase64_3, 100);
                        return
                    });
                }).catch((error) => {
                    console.log('[list_update]', error.message)
                    setTimeout(SendBase64_3, 100);
                    return
                })
            }).catch(function (error) {
                console.log('[image_send]', error.message)
                setTimeout(SendBase64_3, 100);
                return
            });
        } catch (e) {
            imgList_forth.shift()
            setTimeout(SendBase64_3, 100);
        }
    } else {
        setTimeout(SendBase64_3, 100);
    }
}

function SendBase64_4() {
    if (imgList_fifth.length > 0) {
        try {
            console.time('Cycle4')
            console.time('OnlySend4')
            let readFile = fs.readFileSync('./' + geotagging_dir + '/' + imgList_fifth[0]); // 이미지 파일 읽기
            let encode = Buffer.from(readFile).toString('base64'); // 파일 인코딩
            let header = {
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            };
            axios.post("http://" + host + ":4500/images",
                {
                    imageid: imgList_fifth[0].slice(0, 19) + '.jpg',
                    content: "data:image/jpg;base64," + encode,
                },
                header
            ).then(function (response) {
                console.timeEnd('OnlySend4')
                images.push(imgList_fifth[0].slice(0, 19) + '.jpg')
                axios.put("http://" + host + ":4500/lists/listid/" + sended_dir,
                    {content: images}
                ).then(function (response) {
                    move_image('./' + geotagging_dir + '/' + imgList_fifth[0], './' + sended_dir + '/' + imgList_fifth[0].slice(0, 19) + '.jpg')
                        .then((result) => {
                            if (result === 'finish') {
                                count++;

                                empty_count = 0;
                                let msg = status + ' ' + count + ' ' + imgList_fifth[0].slice(0, 19) + '.jpg';
                                lib_mqtt_client.publish(my_status_topic, msg);
                                console.timeEnd("Cycle4");
                                imgList_fifth.shift()
                                setTimeout(SendBase64_4, 100);
                                return
                            } else {
                                console.timeEnd("Cycle4");
                                setTimeout(SendBase64_4, 100);
                                return
                            }
                        }).catch((error) => {
                        // console.log(error);
                        fs.stat('./' + sended_dir + '/' + imgList_fifth[0], (err) => {
                            // console.log(err);
                            if (err !== null && err.code === "ENOENT") {
                                console.log("[sendImages]사진이 존재하지 않습니다.");
                            }
                            console.timeEnd('Cycle4')
                            console.timeEnd('OnlySend4')
                            console.log("[sendImages]이미 처리 후 옮겨진 사진 (" + imgList_fifth[0] + ") 입니다.");
                        });
                        setTimeout(SendBase64_4, 100);
                        return
                    });
                }).catch((error) => {
                    console.log('[list_update]', error.message)
                    setTimeout(SendBase64_4, 100);
                    return
                })
            }).catch(function (error) {
                console.log('[image_send]', error.message)
                setTimeout(SendBase64_4, 100);
                return
            });
        } catch (e) {
            imgList_fifth.shift()
            setTimeout(SendBase64_4, 100);
        }
    } else {
        setTimeout(SendBase64_4, 100);
    }
}

SendBase64_0();
SendBase64_1();
SendBase64_2();
SendBase64_3();
SendBase64_4();

setInterval(() => {
    // 환경이 구성 되었다. 이제부터 시작한다.
    if (status === 'Start') {
        status = 'Started';

        send_image();
        console.time('Finish')
    }
}, 1000);

const move_image = ((from, to, image) => {
    console.time('moveImage')
    return new Promise((resolve, reject) => {
        try {
            fs.rename(from + image, to + image, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve('finish');
                    console.timeEnd('moveImage')
                }
            });
            // fs.copyFile(from + image, to + image, (err) => {
            //     fs.unlink(from + image, (err) => {
            //         if (err) {
            //             reject(err);
            //         } else {
            //             resolve('finish');
            //             console.timeEnd('moveImage')
            //         }
            //     });
            // });
        } catch (e) {
            reject('no such file');
        }
    });
});
