const { loginSchema, changeInitialPasswordSchema } = require('./auth.schema');
const { authenticateAdmin, changeInitialPassword } = require('./auth.service');
const { setSessionCookie } = require('./auth.cookies');
const { revokeSession } = require('./session.service');
const { getSessionCookieName, clearSessionCookie } = require('./auth.cookies');


async function login(req, res) {
    const validate = loginSchema.safeParse(req.body);

    if(!validate.success) {
        return res.status(400).json({
            message: "Dados de login inválidos.",
            errors: validate.error.issues.map((issues)=>({
                field: issues.path.join("."),
                message: issues.message,
            })),
        });
    };
    
    
    try{
        const result = await authenticateAdmin(validate.data);

        if(!result){
            return res.status(401).json({
                message: "E-mail ou senha inválidos.",
            });
        }

        if (result.session) {
          setSessionCookie(
            res,
            result.session.token,
            result.session.expiresAt
          );
        }

        return res.status(200).json({
          message:
            result.nextStep === "CHANGE_PASSWORD"
              ? "A senha inicial precisa ser alterada."
              : "Login realizado com sucesso.",
                
          data: {
            user: result.user,
            nextStep: result.nextStep,
            preAuthToken: result.preAuthToken,
          },
        });
    }
    catch(error){
        console.log("Erro no login administrativo:", error);

        return res.status(500).json({
            message: "Não foi possível realizar o login."
        });
    }
}

async function changePassword(req, res) {
  const input = {
    newPassword: req.body?.newPassword,
    confirmPassword: req.body?.confirmPassword,
  };

  console.log("Dados enviados ao Zod:", input);

  const validation =
    changeInitialPasswordSchema.safeParse(input);

  if (!validation.success) {
    return res.status(400).json({
      message: "Nova senha inválida.",
      errors: validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  try {
    const result = await changeInitialPassword({
      userId: req.preAuth.userId,
      newPassword: validation.data.newPassword,
    });

    return res.status(200).json({
      message: "Senha alterada com sucesso.",
      data: result,
    });
  } catch (error) {
    console.error("Erro ao alterar senha inicial:", error);

    return res.status(error.statusCode || 500).json({
      message:
        error.statusCode
          ? error.message
          : "Não foi possível alterar a senha.",
    });
  }
}

async function me(req, res) {
    return res.status(200).json({
        data:{
            user: req.auth.user,
        },
    });
}

async function logout(req, res) {
    try{
        const cookieName = getSessionCookieName();
        const token = req.cookies?.[cookieName];

        await revokeSession(token);

        clearSessionCookie(res);

        return res.status(200).json({
            message: "Logout realizado com sucesso.",
        });
    }
    catch(error){
        console.error("Erro no logout:", error);

        return res.status(500).json({
            message: "Não foi possível realizar o logout.",
        });
    };
}

module.exports = {login, changePassword, me, logout};