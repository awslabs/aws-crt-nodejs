#!/bin/bash

# Get summary of changes
echo "## Changes Summary" > changes_summary.md
echo "" >> changes_summary.md

# Check if package-lock.json changed
if git diff --staged --name-only | grep -q "package-lock.json"; then
    echo "- 📦 package-lock.json updated" >> changes_summary.md
fi

# Check if package.json changed
if git diff --staged --name-only | grep -q "package.json"; then
    echo "- 📋 package.json updated" >> changes_summary.md
fi

# Get audit results
echo "" >> changes_summary.md
echo "### Audit Results" >> changes_summary.md


# Parse audit results for detailed summary
if [ -f audit_results.json ]; then
  # Check if there are any vulnerabilities
  TOTAL_VULNS=$(jq -r '.metadata.vulnerabilities.total // 0' audit_results.json 2>/dev/null)

  if [ "$TOTAL_VULNS" -gt 0 ]; then
    echo "**Security Vulnerabilities Found ($TOTAL_VULNS total):**" >> changes_summary.md
    echo "" >> changes_summary.md

    # Get list of vulnerable packages
    PACKAGES=$(jq -r '.vulnerabilities | keys[]' audit_results.json 2>/dev/null)

    # Process each package
    for PACKAGE in $PACKAGES; do
      SEVERITY=$(jq -r ".vulnerabilities[\"$PACKAGE\"].severity" audit_results.json 2>/dev/null)
      RANGE=$(jq -r ".vulnerabilities[\"$PACKAGE\"].range" audit_results.json 2>/dev/null)
      IS_DIRECT=$(jq -r ".vulnerabilities[\"$PACKAGE\"].isDirect" audit_results.json 2>/dev/null)
      FIX_AVAILABLE=$(jq -r ".vulnerabilities[\"$PACKAGE\"].fixAvailable" audit_results.json 2>/dev/null)
      NODES=$(jq -r ".vulnerabilities[\"$PACKAGE\"].nodes | join(\", \")" audit_results.json 2>/dev/null)

      echo "### 🚨 $PACKAGE ($SEVERITY severity)" >> changes_summary.md
      echo "- **Affected versions:** $RANGE" >> changes_summary.md
      echo "- **Direct dependency:** $([ "$IS_DIRECT" = "true" ] && echo "Yes" || echo "No")" >> changes_summary.md
      echo "- **Fix available:** $([ "$FIX_AVAILABLE" = "true" ] && echo "✅ Yes" || echo "❌ No")" >> changes_summary.md
      echo "- **Installed locations:** $NODES" >> changes_summary.md
      echo "- **Advisories:**" >> changes_summary.md

      # Get advisories for this package
      ADVISORY_COUNT=$(jq -r ".vulnerabilities[\"$PACKAGE\"].via | length" audit_results.json 2>/dev/null)
      for ((i=0; i<ADVISORY_COUNT; i++)); do
        TITLE=$(jq -r ".vulnerabilities[\"$PACKAGE\"].via[$i].title" audit_results.json 2>/dev/null)
        URL=$(jq -r ".vulnerabilities[\"$PACKAGE\"].via[$i].url" audit_results.json 2>/dev/null)
        CVSS_SCORE=$(jq -r ".vulnerabilities[\"$PACKAGE\"].via[$i].cvss.score // 0" audit_results.json 2>/dev/null)

        if [ "$CVSS_SCORE" != "0" ] && [ "$CVSS_SCORE" != "null" ]; then
          echo "  - [$TITLE]($URL) (CVSS: $CVSS_SCORE)" >> changes_summary.md
        else
          echo "  - [$TITLE]($URL)" >> changes_summary.md
        fi
      done

      echo "" >> changes_summary.md
    done

    echo "" >> changes_summary.md

    # Summary by severity
    echo "**Vulnerability Summary by Severity:**" >> changes_summary.md
    jq -r '.metadata.vulnerabilities | to_entries[] | select(.value > 0) |
      if .key == "critical" then "🔴 Critical: " + (.value | tostring)
      elif .key == "high" then "🟠 High: " + (.value | tostring)
      elif .key == "moderate" then "🟡 Moderate: " + (.value | tostring)
      elif .key == "low" then "🟢 Low: " + (.value | tostring)
      elif .key == "info" then "ℹ️ Info: " + (.value | tostring)
      else .key + ": " + (.value | tostring)
      end' audit_results.json 2>/dev/null | while read line; do
      echo "- $line" >> changes_summary.md
    done

    echo "" >> changes_summary.md

    # Recommendations
    echo "**Recommended Actions:**" >> changes_summary.md

    # Check for packages with fixes available
    FIXABLE_COUNT=$(jq -r '[.vulnerabilities[] | select(.fixAvailable == true)] | length' audit_results.json 2>/dev/null)
    if [ "$FIXABLE_COUNT" -gt 0 ]; then
      echo "- 🔧 Run \`npm audit fix\` to automatically fix $FIXABLE_COUNT vulnerable package(s)" >> changes_summary.md
    fi

    # Check for direct dependencies
    DIRECT_VULNS=$(jq -r '[.vulnerabilities[] | select(.isDirect == true)] | length' audit_results.json 2>/dev/null)
    if [ "$DIRECT_VULNS" -gt 0 ]; then
      echo "- ⚠️ $DIRECT_VULNS direct dependencies have vulnerabilities - consider updating or replacing" >> changes_summary.md
    fi

    # Check for critical/high severity
    CRITICAL_HIGH=$(jq -r '(.metadata.vulnerabilities.critical // 0) + (.metadata.vulnerabilities.high // 0)' audit_results.json 2>/dev/null)
    if [ "$CRITICAL_HIGH" -gt 0 ]; then
      echo "- 🚨 $CRITICAL_HIGH critical/high severity vulnerabilities require immediate attention" >> changes_summary.md
    fi

  else
    echo "✅ **No security vulnerabilities found**" >> changes_summary.md
  fi

  # Add dependency summary
  echo "" >> changes_summary.md
  echo "**Dependency Summary:**" >> changes_summary.md
  jq -r '.metadata.dependencies |
    "- Total dependencies: " + (.total | tostring) + "\n" +
    "- Production: " + (.prod | tostring) + "\n" +
    "- Development: " + (.dev | tostring) + "\n" +
    "- Optional: " + (.optional | tostring)' audit_results.json 2>/dev/null >> changes_summary.md

else
  echo "⚠️ **No audit results file found** - run \`npm audit --json > audit_results.json\` to generate security report" >> changes_summary.md
fi

echo "" >> changes_summary.md
echo "### Files Changed" >> changes_summary.md
git diff --staged --name-only | sed 's/^/- /' >> changes_summary.md