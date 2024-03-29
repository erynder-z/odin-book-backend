import mongoose, { Schema, Document, Types } from 'mongoose';

export type PollType = {
    _id: Types.ObjectId;
    owner: Types.ObjectId;
    question: string;
    numberOfOptions: number;
    options: { nameOfOption: string; selectionCount: number }[];
    description: string;
    isFriendOnly: boolean;
    allowComments: boolean;
    respondentUsers: Types.ObjectId[];
    comments: Types.ObjectId[];
    createdAt: Date;
    updatedAt: Date;
};

type PollModelType = PollType & Document;

const PollSchema: Schema = new Schema(
    {
        owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },

        question: { type: String, required: true },
        numberOfOptions: { type: Number, required: true },
        options: [
            {
                nameOfOption: { type: String, required: true },
                selectionCount: { type: Number, required: true, default: 0 },
            },
        ],
        description: { type: String },
        isFriendOnly: { type: Boolean, required: true },
        allowComments: { type: Boolean, required: true },
        respondentUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        comments: [{ type: Schema.Types.ObjectId, ref: 'Comment' }],
    },
    { versionKey: false, timestamps: true }
);

export default mongoose.model<PollModelType>('Poll', PollSchema);
