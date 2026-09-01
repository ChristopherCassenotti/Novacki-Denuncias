const prisma = require(
  "../../database/prisma"
);

const PUBLIC_EVENT_TYPES = [
  "REPORT_CREATED",
  "STATUS_CHANGED",
  "MESSAGE_SENT",
  "INFORMATION_REQUESTED",
  "INFORMATION_RECEIVED",
  "REPORT_CONCLUDED",
  "REPORT_ARCHIVED",
];

function mapPublicEvent(event) {
  return {
    id: event.id,

    type:
      event.event_type,

    previousStatus:
      event.previous_status,

    newStatus:
      event.new_status,

    createdAt:
      event.created_at,
  };
}

async function getReporterHistory(
  reportId
) {
  const report =
    await prisma.reports.findUnique({
      where: {
        id: reportId,
      },

      select: {
        id: true,
      },
    });

  if (!report) {
    return [];
  }

  const events =
    await prisma.report_events.findMany({
      where: {
        report_id: reportId,

        event_type: {
          in: PUBLIC_EVENT_TYPES,
        },
      },

      select: {
        id: true,
        event_type: true,
        previous_status: true,
        new_status: true,
        created_at: true,
      },

      orderBy: {
        created_at: "asc",
      },
    });

  return events.map(
    mapPublicEvent
  );
}

module.exports = {
  getReporterHistory,
};