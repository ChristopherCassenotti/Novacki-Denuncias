const jwt = require('jsonwebtoken');

function requirePreAuth(requireNextStep) {
    return (req, res, next) => {
        const authorization = req.headers.authorization;

        if(!authorization?.startsWith("Baerar ")){
            res.status(401).json({
                message: "Token temporário não informado."
            });
        }

        const token = authorization.substring(7);

        try{
            const payload = jwt.verify(
                token,
                process.env.ADMIN_PRE_AUTH_SECRET,
                {
                    algorithms: ["HS256"],
                    issuer: "novacki-denuncias",
                    audience: "admin-panel",
                }
            );
            
            if(payload.type !== "ADMIN_PRE_AUTH"){
                return res.status(401).json({
                    message: "Token temporário inválido."
                });
            }

            if(requireNextStep && payload.nextStep !== requireNextStep){
                return res.status(403).json({
                    message: "Este token não permite realizar esta ação."
                });
            }

            req.preAuth = {
                userId: payload.sub,
                nextStep: payload.nextStep,
            };

            return next();
        }
        catch(error){
            return res.status(401).json({
                message: "Token temporário inválido ou expirado."
            });
        }
    }
}

module.exports = {requirePreAuth};