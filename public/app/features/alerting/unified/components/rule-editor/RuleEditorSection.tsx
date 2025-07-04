import { css, cx } from '@emotion/css';
import * as React from 'react';
import { ReactElement } from 'react';

import { GrafanaTheme2 } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { t } from '@grafana/i18n';
import { FieldSet, InlineSwitch, Stack, Text, useStyles2 } from '@grafana/ui';

export interface RuleEditorSectionProps {
  title: string;
  stepNo: number;
  description?: string | ReactElement;
  fullWidth?: boolean;
  switchMode?: {
    isAdvancedMode: boolean;
    setAdvancedMode: (isAdvanced: boolean) => void;
  };
}

export const RuleEditorSection = ({
  title,
  stepNo,
  children,
  fullWidth = false,
  description,
  switchMode,
}: React.PropsWithChildren<RuleEditorSectionProps>) => {
  const styles = useStyles2(getStyles);

  const AlertRuleSelectors = selectors.components.AlertRules;
  return (
    <div className={styles.parent} data-testid={AlertRuleSelectors.step(stepNo.toString())}>
      <FieldSet
        className={cx(fullWidth && styles.fullWidth)}
        label={
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Text variant="h3">
              {stepNo}. {title}
            </Text>
            {switchMode && (
              <Text variant="bodySmall">
                <InlineSwitch
                  data-testid={AlertRuleSelectors.stepAdvancedModeSwitch(stepNo.toString())}
                  value={switchMode.isAdvancedMode}
                  onChange={(event) => {
                    switchMode.setAdvancedMode(event.currentTarget.checked);
                  }}
                  label={t('alerting.rule-editor-section.label-advanced-options', 'Advanced options')}
                  showLabel
                  transparent
                  className={styles.reverse}
                />
              </Text>
            )}
          </Stack>
        }
      >
        <Stack direction="column">
          {description && <div className={styles.description}>{description}</div>}
          {children}
        </Stack>
      </FieldSet>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  parent: css({
    display: 'flex',
    flexDirection: 'row',
    border: `solid 1px ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    padding: `${theme.spacing(2)} ${theme.spacing(3)}`,
  }),
  description: css({
    marginTop: `-${theme.spacing(2)}`,
  }),
  fullWidth: css({
    width: '100%',
  }),
  reverse: css({
    flexDirection: 'row-reverse',
    gap: theme.spacing(1),
  }),
});
