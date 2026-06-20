import mongoose from 'mongoose';

const supportTicketSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    guestName: {
        type: String,
        trim: true
    },
    guestEmail: {
        type: String,
        trim: true
    },
    guestPhone: {
        type: String,
        trim: true
    },
    subject: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        enum: ['Return Inquiry', 'General Support', 'Order Issue', 'Technical Issue', 'Other'],
        default: 'General Support'
    },
    status: {
        type: String,
        enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
        default: 'Open'
    },
    adminNotes: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

export default SupportTicket;
