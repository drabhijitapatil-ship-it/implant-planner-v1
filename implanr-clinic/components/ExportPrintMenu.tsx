import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type ExportPrintMenuProps = {
  /** Callback for Print PDF action */
  onPrint: () => void | Promise<void>;
  /** Callback for Export/Download PDF action */
  onExport: () => void | Promise<void>;
  /** Text shown on the trigger button. Defaults to "Export / Print". */
  label?: string;
  /** Optional smaller label for compact trigger. */
  compactLabel?: string;
  /** Style override for the trigger button. */
  buttonStyle?: ViewStyle | ViewStyle[];
  /** Style override for the trigger text. */
  textStyle?: TextStyle | TextStyle[];
  /** Optional icon name for trigger. Defaults to "share-outline". */
  triggerIcon?: keyof typeof Ionicons.glyphMap;
  /** Icon size on the trigger (default 16). */
  triggerIconSize?: number;
  /** Show loading spinner on the trigger (parent-controlled). */
  loading?: boolean;
  /** Disable the trigger. */
  disabled?: boolean;
  /** Test id for the trigger. */
  testID?: string;
  /** Test id for Print option inside the popover. */
  printTestID?: string;
  /** Test id for Export option inside the popover. */
  exportTestID?: string;
  /** Title shown inside the popover. Defaults to "Export or Print". */
  popoverTitle?: string;
  /** Label for the Print action inside the popover. Defaults to "Print PDF". */
  printLabel?: string;
  /** Label for the Export action inside the popover. Defaults to "Export PDF". */
  exportLabel?: string;
};

/**
 * Single trigger button that opens a blue-bordered popover with
 * "Print PDF" and "Export PDF" options. Used app-wide to consolidate
 * the two previously-separate buttons.
 */
export default function ExportPrintMenu({
  onPrint,
  onExport,
  label = 'Export / Print',
  compactLabel,
  buttonStyle,
  textStyle,
  triggerIcon = 'share-outline',
  triggerIconSize = 16,
  loading = false,
  disabled = false,
  testID = 'export-print-trigger',
  printTestID = 'export-print-option-print',
  exportTestID = 'export-print-option-export',
  popoverTitle = 'Export or Print',
  printLabel = 'Print PDF',
  exportLabel = 'Export PDF',
}: ExportPrintMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | 'print' | 'export'>(null);

  const handle = async (which: 'print' | 'export') => {
    if (busy) return;
    setBusy(which);
    try {
      if (which === 'print') {
        await onPrint();
      } else {
        await onExport();
      }
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };

  const effectiveLabel = compactLabel ?? label;

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        disabled={disabled || loading}
        style={[styles.trigger, buttonStyle, (disabled || loading) && styles.triggerDisabled]}
        testID={testID}
        // @ts-ignore - react-native-web accepts data-testid
        data-testid={testID}
        accessibilityRole="button"
        accessibilityLabel={effectiveLabel}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <>
            <Ionicons name={triggerIcon} size={triggerIconSize} color="#FFF" />
            <Text style={[styles.triggerText, textStyle]} numberOfLines={1}>
              {effectiveLabel}
            </Text>
          </>
        )}
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => (busy ? null : setOpen(false))}
          testID="export-print-backdrop"
          // @ts-ignore
          data-testid="export-print-backdrop"
        >
          <Pressable style={styles.popover} onPress={() => {}}>
            <View style={styles.popoverHeader}>
              <Ionicons name="document-text-outline" size={18} color="#1565C0" />
              <Text style={styles.popoverTitle}>{popoverTitle}</Text>
            </View>
            <Text style={styles.popoverHint}>Choose how you want to output this document.</Text>

            <TouchableOpacity
              style={[styles.option, busy === 'export' && styles.optionDim]}
              onPress={() => handle('print')}
              disabled={!!busy}
              testID={printTestID}
              // @ts-ignore
              data-testid={printTestID}
            >
              <View style={[styles.optionIcon, { backgroundColor: '#37474F' }]}>
                {busy === 'print' ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Ionicons name="print" size={18} color="#FFF" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>{printLabel}</Text>
                <Text style={styles.optionSub}>Open system print dialog</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#90A4AE" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.option, busy === 'print' && styles.optionDim]}
              onPress={() => handle('export')}
              disabled={!!busy}
              testID={exportTestID}
              // @ts-ignore
              data-testid={exportTestID}
            >
              <View style={[styles.optionIcon, { backgroundColor: '#1565C0' }]}>
                {busy === 'export' ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Ionicons name="download-outline" size={18} color="#FFF" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>{exportLabel}</Text>
                <Text style={styles.optionSub}>Download / share as PDF file</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#90A4AE" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancel}
              onPress={() => (busy ? null : setOpen(false))}
              disabled={!!busy}
              testID="export-print-cancel"
              // @ts-ignore
              data-testid="export-print-cancel"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1565C0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  triggerDisabled: { opacity: 0.6 },
  triggerText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 25, 40, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  popover: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#1565C0',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  popoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  popoverTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0D47A1',
  },
  popoverHint: {
    fontSize: 12,
    color: '#607D8B',
    marginBottom: 14,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F5FAFF',
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#BBDEFB',
  },
  optionDim: { opacity: 0.5 },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#263238',
  },
  optionSub: {
    fontSize: 11,
    color: '#78909C',
    marginTop: 1,
  },
  cancel: {
    marginTop: 4,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#546E7A',
  },
});
