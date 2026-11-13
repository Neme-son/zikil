import "server-only";
import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { SecuritySeverity } from "@prisma/client";
import { CHECK_STATUS_LABEL, FINISHED_CHECK_STATUSES, TARGET_KIND_LABEL } from "@/lib/security-checks";
import type { CheckReport, SeverityCounts } from "@/lib/security-checks/report";
import { SECURITY_SEVERITIES, SEVERITY_LABEL } from "@/lib/security-severity";

/**
 * The downloadable security report (#security-checks, part 4): the full
 * report of a paid check. An unpaid check has no PDF; its "Download PDF"
 * asks the client to pay instead (agreed with the team, 12 Nov).
 */
type PaidReport = Extract<CheckReport, { paid: true }>;

/**
 * The PDF's own font, embedded in every report. The built-in Helvetica can only
 * draw Western European letters, so Yoruba, Igbo and Hausa names, ₦ and other
 * text came out garbled. Noto Sans (SIL Open Font License, assets/fonts/OFL.txt)
 * covers them. next.config.ts ships these files with the PDF route.
 */
const FONT = "Noto Sans";
const fontFile = (name: string) => path.join(process.cwd(), "assets", "fonts", name);
Font.register({
  family: FONT,
  fonts: [
    { src: fontFile("NotoSans-Regular.ttf"), fontWeight: "normal" },
    { src: fontFile("NotoSans-Bold.ttf"), fontWeight: "bold" },
  ],
});

/** Printed colours, matching the severity chips' light palette. */
const SEVERITY_COLOUR: Record<SecuritySeverity, string> = {
  critical: "#b91c1c",
  high: "#c2410c",
  medium: "#b45309",
  low: "#475569",
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: FONT, color: "#111827", lineHeight: 1.45 },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  meta: { marginTop: 3, color: "#4b5563" },
  section: { marginTop: 18 },
  heading: { fontSize: 12, fontWeight: "bold", marginBottom: 6 },
  problem: { marginBottom: 10, padding: 10, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 6 },
  severity: { fontSize: 9, fontWeight: "bold", textTransform: "uppercase" },
  problemTitle: { marginTop: 2, fontSize: 11, fontWeight: "bold" },
  body: { marginTop: 3 },
  fixLabel: { marginTop: 6, fontSize: 9, fontWeight: "bold", color: "#4b5563" },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: "#6b7280" },
});

/** Problem text is written in Markdown; the PDF prints it as plain text. */
function plain(text: string): string {
  return text.replace(/\*\*|__|`/g, "");
}

function countsText(counts: SeverityCounts): string {
  return SECURITY_SEVERITIES.filter((level) => counts[level] > 0)
    .map((level) => `${counts[level]} ${SEVERITY_LABEL[level].toLowerCase()}`)
    .join(" · ");
}

function Problem({ severity, title, description, howToFix }: { severity: SecuritySeverity; title: string; description: string; howToFix: string }) {
  return (
    <View style={styles.problem} wrap={false}>
      <Text style={[styles.severity, { color: SEVERITY_COLOUR[severity] }]}>{SEVERITY_LABEL[severity]}</Text>
      <Text style={styles.problemTitle}>{plain(title)}</Text>
      <Text style={styles.body}>{plain(description)}</Text>
      <Text style={styles.fixLabel}>How to fix</Text>
      <Text style={styles.body}>{plain(howToFix)}</Text>
    </View>
  );
}

function ReportDocument({ report, generatedAt }: { report: PaidReport; generatedAt: Date }) {
  const still = !FINISHED_CHECK_STATUSES.has(report.status);
  const kind = TARGET_KIND_LABEL[report.target.kind];
  return (
    <Document title={`Security report: ${report.target.input}`} author="Ziki">
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Security report</Text>
        <Text style={styles.meta}>{kind}: {report.target.input}</Text>
        <Text style={styles.meta}>
          {CHECK_STATUS_LABEL[report.status]} · {report.progress.done} of {report.progress.total} parts checked · Made{" "}
          {generatedAt.toISOString().slice(0, 10)}
        </Text>

        {report.summary ? (
          <View style={styles.section}>
            <Text style={styles.heading}>Summary</Text>
            <Text>{plain(report.summary)}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.heading}>
            {report.total === 0
              ? still ? "Nothing found yet" : "No problems found"
              : `${report.total} ${report.total === 1 ? "problem" : "problems"} found${still ? " so far" : ""}: ${countsText(report.counts)}`}
          </Text>

          {report.results.map((result) => (
            <Problem key={result.id} severity={result.severity} title={result.title} description={result.description} howToFix={result.howToFix} />
          ))}
        </View>

        <Text style={styles.footer} fixed>
          Private to your Ziki workspace. Agents looked for weaknesses; they did not exploit them.
        </Text>
      </Page>
    </Document>
  );
}

/** Only a paid check has a PDF: the type refuses an unpaid report outright. */
export function renderReportPdf(report: PaidReport): Promise<Buffer> {
  return renderToBuffer(<ReportDocument report={report} generatedAt={new Date()} />);
}
