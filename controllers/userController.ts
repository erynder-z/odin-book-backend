import { Request, Response, NextFunction } from 'express';
import User, { UserModelType } from '../models/user';
import { JwtUser } from '../types/jwtUser';
import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import { FriendType } from '../types/friendType';

const getSomeUsers = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const reqUser = req.user as JwtUser;

    try {
        const currentUser = await User.findById(reqUser._id);
        if (!currentUser) {
            return res.status(404).json({
                errors: [
                    {
                        message: 'Something went wrong retrieving user data!',
                    },
                ],
            });
        }

        const friends = currentUser.friends.map((friend) => friend.toString());
        const userList = await User.aggregate([
            {
                $match: {
                    _id: {
                        $nin: [
                            currentUser._id,
                            ...friends.map((friend) => friend.toString()),
                        ],
                    },
                    friends: {
                        $nin: [currentUser._id],
                    },
                },
            },
            { $sample: { size: 10 } },
            {
                $project: {
                    _id: 1,
                    firstName: 1,
                    lastName: 1,
                    userpic: 1,
                },
            },
        ]);
        return res.status(200).json({ userList });
    } catch (err) {
        return next(err);
    }
};

const getOtherUserData = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({
                errors: [
                    {
                        message: 'Something went wrong retrieving user data!',
                    },
                ],
            });
        }

        const reqUser = req.user as JwtUser;

        const reqUserId = new mongoose.Types.ObjectId(reqUser._id);
        const isFriend = user.friends.includes(reqUserId);
        const isFriendRequestPending =
            user.pendingFriendRequests.includes(reqUserId);

        let friends: FriendType[] = [];
        let mutual_friends = 0;

        if (isFriend) {
            const [friendObjects, mutualFriends] = await Promise.all([
                getFriendData(user),
                getMutualFriends(user._id, reqUser._id),
            ]);

            friends = friendObjects;
            mutual_friends = mutualFriends;
        }

        const userObj = formatUserData(user, isFriend, friends, mutual_friends);

        res.json({
            user: userObj,
            isFriend,
            isFriendRequestPending,
        });
    } catch (err) {
        next(err);
    }
};

const getFriendData = async (user: UserModelType) => {
    const friendObjects = await User.aggregate([
        {
            $match: {
                _id: { $in: user.friends },
            },
        },
        {
            $project: {
                _id: 1,
                firstName: 1,
                lastName: 1,
                username: 1,
                userpic: 1,
            },
        },
    ]);

    return friendObjects;
};

const getMutualFriends = async (userId: string, otherUserId: string) => {
    const user = await User.findById(userId);
    const otherUser = await User.findById(otherUserId);

    if (!user || !otherUser) {
        return 0;
    }

    const userFriends = user.friends.map((friend) => friend.toString());
    const otherUserFriends = otherUser.friends.map((friend) =>
        friend.toString()
    );

    return userFriends.filter((friend) => otherUserFriends.includes(friend))
        .length;
};

const formatUserData = (
    user: UserModelType,
    isFriend: boolean,
    friends: FriendType[],
    mutual_friends: number
) => {
    const {
        _id,
        firstName: firstName,
        lastName: lastName,
        username,
        userpic,
        joined,
        lastSeen: lastSeen,
    } = user;

    const userObj = {
        _id,
        firstName,
        lastName,
        username,
        userpic,
        ...(isFriend && { joined, lastSeen, friends, mutual_friends }),
    };

    return userObj;
};

const sendFriendRequest = [
    body('currentUserId', 'User id missing.')
        .trim()
        .isLength({ min: 1 })
        .escape(),
    body('requestUserId', 'User id missing.')
        .trim()
        .isLength({ min: 1 })
        .escape(),

    async (req: Request, res: Response, next: NextFunction) => {
        const errors = validationResult(req);

        const currentUserID = req.body.currentUserId;
        const requestUserID = req.body.requestUserId;

        if (!errors.isEmpty()) {
            res.status(400).json({
                message: 'Failed to send friend request!',
                errors: errors.array(),
            });

            return;
        }

        try {
            const updatedUser = await User.findOneAndUpdate(
                {
                    _id: requestUserID,
                    pendingFriendRequests: { $ne: currentUserID },
                },
                { $push: { pendingFriendRequests: currentUserID } },
                { new: true }
            );

            if (!updatedUser) {
                return res.status(406).json({
                    errors: [
                        {
                            message: 'Could not send friend request!',
                        },
                    ],
                });
            }

            res.status(200).json({
                title: 'Friend request sent!',
            });
        } catch (err) {
            return next(err);
        }
    },
];

const acceptFriendRequest = [
    body('currentUserId', 'User id missing.').notEmpty().escape(),
    body('requestUserId', 'User id missing.').notEmpty().escape(),

    async (req: Request, res: Response, next: NextFunction) => {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                message: 'Failed accept friend request!',
                errors: errors.array(),
            });
        }

        const { currentUserId, requestUserId } = req.body;

        try {
            const [currentUser, requestUser] = await Promise.all([
                getUserById(currentUserId),
                getUserById(requestUserId),
            ]);

            if (!canAcceptFriendRequest(currentUser, requestUser)) {
                return res.status(406).json({
                    errors: [
                        {
                            message: 'Could not accept friend request!',
                        },
                    ],
                });
            }

            await acceptFriendRequestForUsers(currentUser, requestUser);

            return res.status(200).json({
                title: 'Friend request accepted!',
            });
        } catch (err) {
            return next(err);
        }
    },
];

const getUserById = async (id: string) => {
    const user = await User.findById(id);
    if (!user) {
        throw new Error('User not found');
    }
    return user;
};

const canAcceptFriendRequest = (
    currentUser: UserModelType,
    requestUser: UserModelType
) => {
    return (
        currentUser?.pendingFriendRequests.includes(requestUser._id) &&
        !requestUser?.friends.includes(currentUser._id)
    );
};

const acceptFriendRequestForUsers = async (
    currentUser: UserModelType,
    requestUser: UserModelType
) => {
    currentUser.friends.push(requestUser._id);
    requestUser.friends.push(currentUser._id);
    currentUser.pendingFriendRequests =
        currentUser.pendingFriendRequests.filter(
            (userId) => userId.toString() !== requestUser._id.toString()
        );
    requestUser.pendingFriendRequests =
        requestUser.pendingFriendRequests.filter(
            (userId) => userId.toString() !== currentUser._id.toString()
        );
    await Promise.all([currentUser.save(), requestUser.save()]);
};

const declineFriendRequest = [
    body('currentUserId', 'User id missing.').notEmpty().escape(),
    body('requestUserId', 'User id missing.').notEmpty().escape(),

    async (req: Request, res: Response, next: NextFunction) => {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                message: 'Failed decline friend request!',
                errors: errors.array(),
            });
        }

        const { currentUserId, requestUserId } = req.body;

        try {
            const [currentUser, requestUser] = await Promise.all([
                getUserById(currentUserId),
                getUserById(requestUserId),
            ]);

            if (!canDeclineFriendRequest(currentUser, requestUser)) {
                return res.status(406).json({
                    errors: [
                        {
                            message: 'Could not decline friend request!',
                        },
                    ],
                });
            }

            await declineFriendRequestForUsers(currentUser, requestUser);

            return res.status(200).json({
                title: 'Friend request declined!',
            });
        } catch (err) {
            return next(err);
        }
    },
];

const canDeclineFriendRequest = (
    currentUser: UserModelType,
    requestUser: UserModelType
) => {
    return (
        currentUser?.pendingFriendRequests.includes(requestUser._id) &&
        !requestUser?.friends.includes(currentUser._id)
    );
};

const declineFriendRequestForUsers = async (
    currentUser: UserModelType,
    requestUser: UserModelType
) => {
    currentUser.pendingFriendRequests =
        currentUser.pendingFriendRequests.filter(
            (userId) => userId.toString() !== requestUser._id.toString()
        );
    requestUser.pendingFriendRequests =
        requestUser.pendingFriendRequests.filter(
            (userId) => userId.toString() !== currentUser._id.toString()
        );
    await Promise.all([currentUser.save(), requestUser.save()]);
};

const unfriendUser = [
    body('currentUserId', 'User id missing.').notEmpty().escape(),
    body('requestUserId', 'User id missing.').notEmpty().escape(),

    async (req: Request, res: Response, next: NextFunction) => {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                message: 'Failed to unfriend!',
                errors: errors.array(),
            });
        }

        const { currentUserId, requestUserId } = req.body;

        try {
            const [currentUser, requestUser] = await Promise.all([
                getUserById(currentUserId),
                getUserById(requestUserId),
            ]);

            if (!canUnfriend(currentUser, requestUser)) {
                return res.status(406).json({
                    errors: [
                        {
                            message: 'You are not friends!',
                        },
                    ],
                });
            }

            await removeUserFromFriends(currentUser, requestUser);

            return res.status(200).json({
                title: 'You are no longer friends!',
            });
        } catch (err) {
            return next(err);
        }
    },
];

const canUnfriend = (
    currentUser: UserModelType,
    requestUser: UserModelType
) => {
    return (
        currentUser?.friends.includes(requestUser._id) &&
        requestUser?.friends.includes(currentUser._id)
    );
};

const removeUserFromFriends = async (
    currentUser: UserModelType,
    requestUser: UserModelType
) => {
    currentUser.friends = currentUser.friends.filter(
        (userId) => userId.toString() !== requestUser._id.toString()
    );
    requestUser.friends = requestUser.friends.filter(
        (userId) => userId.toString() !== currentUser._id.toString()
    );
    await Promise.all([currentUser.save(), requestUser.save()]);
};

export {
    getSomeUsers,
    getOtherUserData,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    unfriendUser,
};
