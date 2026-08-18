const { z } = require("zod");

const dashboardQuerySchema =
    z.object({
        dateFrom: z
            .string()
            .datetime()
            .optional(),

        dateTo: z
            .string()
            .datetime()
            .optional(),
    })
    .refine(
        (data) => {
            if (
                !data.dateFrom ||
                !data.dateTo
            ) {
                return true;
            }

            return (
                new Date(
                    data.dateFrom
                ) <=
                new Date(
                    data.dateTo
                )
            );
        },
        {
            message:
                "A data inicial não pode ser posterior à data final.",
        }
    );

module.exports = {
    dashboardQuerySchema,
};