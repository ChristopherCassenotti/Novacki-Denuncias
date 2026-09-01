const { z } = require("zod");

const reportModes = [
    "ANONYMOUS",
    "IDENTIFIED",
];

const relationshipTypes = [
    "EMPLOYEE",
    "FORMER_EMPLOYEE",
    "SUPPLIER",
    "CUSTOMER",
    "OTHER",
];

const priorities = [
    "LOW",
    "NORMAL",
    "HIGH",
    "CRITICAL",
];

const nullableUuid =
    z.string()
        .uuid()
        .nullable();

const createRoutingRuleSchema =
    z.object({
        name: z
            .string()
            .trim()
            .min(3)
            .max(150),

        priority: z
            .number()
            .int()
            .min(0)
            .max(100000)
            .default(100),

        isActive: z
            .boolean()
            .default(true),

        stopProcessing: z
            .boolean()
            .default(true),

        categoryId:
            nullableUuid
                .optional()
                .default(null),

        unitId:
            nullableUuid
                .optional()
                .default(null),

        reportMode:
            z.enum(reportModes)
                .nullable()
                .optional()
                .default(null),

        relationshipType:
            z.enum(
                relationshipTypes
            )
                .nullable()
                .optional()
                .default(null),

        immediateRisk:
            z.boolean()
                .nullable()
                .optional()
                .default(null),

        restrictedRoleId:
            nullableUuid
                .optional()
                .default(null),

        targetUserId:
            nullableUuid
                .optional()
                .default(null),

        targetTeamId:
            nullableUuid
                .optional()
                .default(null),

        setPriority:
            z.enum(priorities)
                .nullable()
                .optional()
                .default(null),
    })
    .superRefine(
        (data, ctx) => {
            if (
                data.targetUserId &&
                data.targetTeamId
            ) {
                ctx.addIssue({
                    code:
                        z.ZodIssueCode
                            .custom,

                    message:
                        "A regra não pode encaminhar simultaneamente para usuário e equipe.",

                    path: [
                        "targetUserId",
                    ],
                });
            }

            if (
                !data.targetUserId &&
                !data.targetTeamId &&
                !data.setPriority
            ) {
                ctx.addIssue({
                    code:
                        z.ZodIssueCode
                            .custom,

                    message:
                        "A regra precisa executar pelo menos uma ação.",
                });
            }
        }
    );

const updateRoutingRuleSchema =
    z.object({
        name: z
            .string()
            .trim()
            .min(3)
            .max(150)
            .optional(),

        priority: z
            .number()
            .int()
            .min(0)
            .max(100000)
            .optional(),

        stopProcessing:
            z.boolean()
                .optional(),

        categoryId:
            nullableUuid
                .optional(),

        unitId:
            nullableUuid
                .optional(),

        reportMode:
            z.enum(reportModes)
                .nullable()
                .optional(),

        relationshipType:
            z.enum(
                relationshipTypes
            )
                .nullable()
                .optional(),

        immediateRisk:
            z.boolean()
                .nullable()
                .optional(),

        restrictedRoleId:
            nullableUuid
                .optional(),

        targetUserId:
            nullableUuid
                .optional(),

        targetTeamId:
            nullableUuid
                .optional(),

        setPriority:
            z.enum(priorities)
                .nullable()
                .optional(),
    })
    .refine(
        (data) =>
            Object.keys(data)
                .length > 0,
        {
            message:
                "Informe pelo menos um campo.",
        }
    );

const routingRuleStatusSchema =
    z.object({
        isActive:
            z.boolean(),
    });

const routingRuleIdSchema =
    z.object({
        id: z
            .string()
            .uuid(),
    });

module.exports = {
    createRoutingRuleSchema,
    updateRoutingRuleSchema,
    routingRuleStatusSchema,
    routingRuleIdSchema,
};