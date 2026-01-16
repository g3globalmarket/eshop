#!/bin/bash
# Regression guard: Prevents returning {} for QPay API responses
# This ensures all QPay response functions use proper type assertions

set -e

QPAY_FILES=(
  "apps/order-service/src/payments/qpay-auth.service.ts"
  "apps/order-service/src/payments/qpay.client.ts"
)

ERRORS=0

echo "Checking for 'return {}' patterns in QPay response functions..."

for file in "${QPAY_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "Warning: File not found: $file"
    continue
  fi

  # Check for return {} patterns in QPay response functions
  if grep -n "return {}" "$file" > /dev/null 2>&1; then
    echo "❌ ERROR: Found 'return {}' in $file"
    grep -n "return {}" "$file"
    ERRORS=$((ERRORS + 1))
  fi

  # Check for type annotations that should be assertions (optional check)
  # This is a warning, not an error
  if grep -n "const.*: QPay.*Response = await response.json()" "$file" > /dev/null 2>&1; then
    echo "⚠️  WARNING: Found type annotation instead of assertion in $file"
    echo "   Consider using: const data = (await response.json()) as QPayXxxResponse;"
  fi
done

if [ $ERRORS -eq 0 ]; then
  echo "✅ No 'return {}' patterns found in QPay response functions"
  exit 0
else
  echo "❌ Found $ERRORS error(s). Fix before committing."
  exit 1
fi

