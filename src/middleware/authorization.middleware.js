export const authorization = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) return next(new Error("Unauthorized", { cause: 401 }));
    if (!roles.includes(req.user.roleType)) {
      return next(new Error("Forbidden: You don't have access", { cause: 403 }));
    }
    return next();
  };
};
