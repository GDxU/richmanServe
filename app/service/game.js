'use strict';
const sha256 = require('sha256');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');

const Service = require('../core/base_service');

module.exports = class extends Service {
    /**
     * 查询房间列表
     */
    async getRooms() {
        try {
            let roomIds = await this.app.redis.keys("richman-room-*");
            console.log('room:', roomIds)
            let rooms = []
            for (let i in roomIds) {
                let room = await this.app.redis.hgetall(roomIds[i])
                delete room.area;
                room.roomId = roomIds[i];
                rooms.push(room);
            }
            // if (!this.ctx.helper.isEmpty(rooms)) {
            return this.success(rooms);
            // }
        } catch (error) {
            this.logger.error(error);//打印报错信息
            return this.fail(this.config.result.EXCEPTION, error.message);
        }
    }

    /**
     * 查询指定房间信息
     * @param {String} id 房间id 
     */
    async getRoom(id) {
        try {
            let room = await this.app.redis.hgetall(id);
            console.log('room:', room)
            if (!this.ctx.helper.isEmpty(room)) {
                return this.success(room);
            } else {
                return this.fail(this.config.result.ROOME_NOT_FOUND);
            }
        } catch (error) {
            this.logger.error(error);//打印报错信息
            return this.fail(this.config.result.EXCEPTION, error.message);
        }
    }

    /**
     * 创建房间
     */
    async createRoom(query) {
        console.log('createRoom -----------------')
        console.log('qqq： ', query);
        const { ctx, app, config } = this;
        try {
            // let userInfo = await app.redis.hgetall(config.redis.prefix + 'token-' + message.token);
            let userInfo = await app.model.User.findById(ctx.state.userId);
            console.log('user111: ', userInfo)
            let roomId = uuid.v1();;
            // ctx.socket.join(roomId);
            let colors = ['red', 'yellow', 'orange', 'green', 'blue', 'purple', 'saddlebrown', 'silver'];
            let random = Math.floor(Math.random() * colors.length) <= colors.length - 1 ? Math.floor(Math.random() * colors.length) : colors.length - 1;
            console.log(colors)
            let area = config.country;
            for (let i in area) {
                area[i].owner = '';
                area[i].rank = 0;
            }

            let roomInfo = {
                _id: config.redis.prefix + 'room-' + roomId,
                name: query.name,
                userNum: 1,
                aliveNum: 1,
                max: Number(query.max),
                status: '等待',
                colors: colors,
                playerIds: [userInfo._id],
                currentRound: 0,
                owner: userInfo._id,
                currentStatus: 'dice',  // 等待掷骰子(dice)、等待玩家操作(oper)
                initMoney: Number(query.initMoney),
                players: JSON.stringify({
                    [userInfo._id]: {
                        username: userInfo.username,
                        step: 0,
                        status: 'normal',
                        money: Number(query.initMoney),
                        color: colors[random],
                        position: {
                            x: 91.67,
                            y: 85.815
                        },
                        area: config.country[0],
                        createdAt: userInfo.createdAt
                    }
                }),
                area: JSON.stringify(area)
            }
            console.log('aaa" ', colors[random])
            colors.splice(random, 1);
            console.log('ffff: ', colors)
            console.log('roomInfo: ', roomInfo)
            app.redis.hmset(config.redis.prefix + 'room-' + roomId, roomInfo)
            // app.model.game

            return this.success({
                roomId: config.redis.prefix + 'room-' + roomId
            });
        } catch (error) {
            this.logger.error(error);
            return this.fail(this.config.result.EXCEPTION, error.message);
        }
    }

    /**
     * 加入房间
     */
    async joinRoom(roomId) {
        console.log('====================================')
        console.log('joinRoom')
        const { ctx, app, config } = this;
        try {
            const nsp = app.io.of('/');
            // let userInfo = await app.redis.hgetall(config.redis.prefix + 'token-' + message.token);
            let userInfo = await app.model.User.findById(ctx.state.userId);
            console.log('userss: ', userInfo);
            let roomInfo = await app.redis.hgetall(roomId)
            if (!ctx.helper.isEmpty(roomInfo) && !ctx.helper.isEmpty(roomInfo.players) && roomInfo.status === '等待') {
                let players = JSON.parse(roomInfo.players);
                // console.log('11111')
                if (!ctx.helper.isEmpty(userInfo._id) && ctx.helper.isEmpty(players[userInfo._id])) {
                    // console.log(roomInfo.userNum)
                    // console.log(roomInfo.max)
                    // console.log(Number(roomInfo.userNum) < Number(roomInfo.max))
                    if (Number(roomInfo.userNum) < Number(roomInfo.max)) {
                        // ctx.socket.join(message.roomId);
                        let colors = roomInfo.colors.split(',');
                        console.log('cccc: ', colors)
                        let random = Math.floor(Math.random() * colors.length) <= colors.length - 1 ? Math.floor(Math.random() * colors.length) : colors.length - 1;
                        console.log('ran:', random);
                        players[userInfo._id] = {
                            username: userInfo.username,
                            step: 0,
                            money: roomInfo.initMoney,
                            status: 'normal',
                            color: colors[random],
                            position: {
                                x: 91.67,
                                y: 85.815
                            },
                            area: config.country[0],
                            createdAt: userInfo.createdAt
                        }
                        colors.splice(random, 1);
                        console.log('afffff: ', colors)
                        let playerIds = roomInfo.playerIds += ',' + userInfo._id;
                        await app.redis.hmset(roomId, { colors: colors, players: JSON.stringify(players), playerIds: playerIds, userNum: Number(roomInfo.userNum) + 1, aliveNum: Number(roomInfo.aliveNum) + 1 });
                        nsp.emit(roomId + '-joinRoomBack', {
                            user: userInfo,
                            type: 'join'
                        })

                        return this.success();
                    }else {
                        return this.fail(this.config.result.HAS_MAX, '已达到最大人数');
                    }
                } else {
                    nsp.emit(roomId + '-joinRoomBack', {
                        user: userInfo,
                        type: 'return'
                    })
                    return this.fail(this.config.result.HAS_EXIST, '已在房间中');
                }
            } else {
                return this.fail(this.config.result.HAS_START);
            }
            // app.redis.hmset(config.redis.prefix + 'room-' + message.roomId, roomInfo)
        } catch (error) {
            this.logger.error(error);
            return this.fail(this.config.result.EXCEPTION, error.message);
        }
    }

    /**
     * 开始游戏
     */
    async startGame(roomId) {
        console.log('====================================')
        console.log('startGame')
        const { ctx, app, config } = this;
        try {
            const nsp = app.io.of('/');
            // let userInfo = await app.redis.hgetall(config.redis.prefix + 'token-' + message.token);
            let userInfo = await app.model.User.findById(ctx.state.userId);
            console.log('userss: ', userInfo);
            let roomInfo = await app.redis.hgetall(roomId)
            console.log('room: ', roomInfo)
            if (!ctx.helper.isEmpty(roomInfo) && !ctx.helper.isEmpty(roomInfo.players) && roomInfo.status === '等待') {
                let players = JSON.parse(roomInfo.players);
                if (!ctx.helper.isEmpty(userInfo._id) && !ctx.helper.isEmpty(players[userInfo._id]) && roomInfo.owner == userInfo._id) {
                    await app.redis.hmset(roomId, { status: '游戏中' });
                    nsp.emit(roomId + '-startGameBack', {
                        user: userInfo._id,
                        type: 'start'
                    })
                    return this.success();
                } else {
                    return this.fail(this.config.result.NO_PERMISSION, '你不是房主');
                }
            } else {
                return this.fail(this.config.result.HAS_START);
            }
        } catch (error) {
            this.logger.error(error);
            return this.fail(this.config.result.EXCEPTION, error.message);
        }
    }

    /**
     * 获取当前玩家拥有的地域信息
     */
    async getCurrentAreas(roomId) {
        console.log('====================================')
        console.log('getCurrentAreas')
        const { ctx, app, config } = this;
        try {
            const nsp = app.io.of('/');
            let userInfo = await app.model.User.findById(ctx.state.userId);
            let roomInfo = await app.redis.hgetall(roomId)
            let areas = JSON.parse(roomInfo.area);
            let result = [];
            for(let i in areas){
                if(areas[i].owner == userInfo._id && areas[i].type == 'place'){
                    areas[i].id = i;
                    areas[i].price /= 2;
                    areas[i].upgradePrice /= 2;
                    areas[i].rank = Number(areas[i].rank)-1;
                    areas[i].total = areas[i].price + areas[i].upgradePrice*Number(areas[i].rank);
                    result.push(areas[i]);
                }
            }
            return this.success(result);
        } catch (error) {
            this.logger.error(error);
            return this.fail(this.config.result.EXCEPTION, error.message);
        }
    }

    // /**
    //  * 更新
    //  * @param {*} _id 
    //  * @param {*} payload 
    //  */
    // async update(_id, payload) {
    //     try {
    //         let newuser = await this.ctx.model.User.findById(_id);
    //         if (this.ctx.helper.isEmpty(newuser)) {
    //             return this.fail(this.config.result.USER_NOT_FOUND);
    //         }
    //         await this.ctx.model.User.findByIdAndUpdate(_id, payload);
    //         return this.success();
    //     } catch (error) {
    //         return this.fail(this.config.result.EXCEPTION, error.message);
    //     }
    // }
};