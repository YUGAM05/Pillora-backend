"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorize = void 0;
const authorize = (...roles) => {
    return (req, res, next) => {
        var _a;
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                message: `User role ${(_a = req.user) === null || _a === void 0 ? void 0 : _a.role} is not authorized to access this route`
            });
        }
        next();
    };
};
exports.authorize = authorize;
