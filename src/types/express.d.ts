declare global {
    namespace Express {
        interface Request {
            user?: any;
            hospitalId?: string;
        }
    }
}

export {};