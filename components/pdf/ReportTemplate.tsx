import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';

Font.register({
  family: 'Helvetica',
  fonts: [],
});

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: '#1C1917',
  },
  header: {
    backgroundColor: '#1C1917',
    padding: 20,
    marginBottom: 24,
    borderRadius: 4,
  },
  headerTitle: {
    color: '#E8761A',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  headerSubtitle: {
    color: '#F5EFE6',
    fontSize: 12,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#E8761A',
    borderBottomWidth: 1,
    borderBottomColor: '#E8761A',
    paddingBottom: 4,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  label: {
    width: '50%',
    color: '#666666',
  },
  value: {
    width: '50%',
    fontWeight: 'bold',
  },
  explanation: {
    fontSize: 10,
    color: '#555555',
    lineHeight: 1.6,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 9,
    color: '#999999',
    borderTopWidth: 1,
    borderTopColor: '#eeeeee',
    paddingTop: 8,
  },
  warning: {
    backgroundColor: '#fff3cd',
    border: '1px solid #ffc107',
    padding: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  warningText: {
    color: '#856404',
    fontSize: 10,
  },
});

interface ReportTemplateProps {
  tool: 'ohm' | 'diepte';
  inputValues: Record<string, string | number>;
  results: Record<string, string | number>;
  date?: string;
  warning?: string;
  explanationText: string;
  reportTitle: string;
  generatedByText: string;
  inputValuesLabel: string;
  resultsLabel: string;
  explanationLabel: string;
  dateLabel: string;
}

export function ReportTemplate({
  tool,
  inputValues,
  results,
  date,
  warning,
  explanationText,
  reportTitle,
  generatedByText,
  inputValuesLabel,
  resultsLabel,
  explanationLabel,
  dateLabel,
}: ReportTemplateProps) {
  const toolLabel = tool === 'ohm' ? 'Ohm Calculator' : 'Diepte Calculator';
  const reportDate = date ?? new Date().toLocaleDateString('nl-NL');

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>EarthGND</Text>
          <Text style={styles.headerSubtitle}>{reportTitle} — {toolLabel}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{inputValuesLabel}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>{dateLabel}</Text>
            <Text style={styles.value}>{reportDate}</Text>
          </View>
          {Object.entries(inputValues).map(([key, val]) => (
            <View key={key} style={styles.row}>
              <Text style={styles.label}>{key}</Text>
              <Text style={styles.value}>{String(val)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{resultsLabel}</Text>
          {Object.entries(results).map(([key, val]) => (
            <View key={key} style={styles.row}>
              <Text style={styles.label}>{key}</Text>
              <Text style={styles.value}>{String(val)}</Text>
            </View>
          ))}
          {warning && (
            <View style={styles.warning}>
              <Text style={styles.warningText}>⚠ {warning}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{explanationLabel}</Text>
          <Text style={styles.explanation}>{explanationText}</Text>
        </View>

        <Text style={styles.footer}>
          {generatedByText} · earthgnd.nl · {reportDate}
        </Text>
      </Page>
    </Document>
  );
}
