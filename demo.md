            <TouchableOpacity
              style={styles.legalRow}
              onPress={() => router.push('/admin/scanner-suggestions' as any)}
              data-testid="link-scanner-suggestions"
              testID="link-scanner-suggestions"
            >
              <Ionicons name="scan-outline" size={22} color="#1565C0" />
              <Text style={styles.legalRowText}>Intraoral scanner suggestions</Text>
              <Ionicons name="chevron-forward" size={18} color="#999" />
            </TouchableOpacity>
