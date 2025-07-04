---
canonical: https://grafana.com/docs/grafana/latest/alerting/best-practices/missing-data/
description: Learn how to detect missing metrics and design alerts that handle gaps in data in Prometheus and Grafana Alerting.
keywords:
  - grafana
  - alerting
  - guide
  - rules
  - create
labels:
  products:
    - cloud
    - enterprise
    - oss
menuTitle: Handle missing data
title: Handle missing data in Grafana Alerting
weight: 1020
refs:
  connectivity-errors-guide:
    - pattern: /docs/grafana/
      destination: /docs/grafana/<GRAFANA_VERSION>/alerting/best-practices/connectivity-errors/
    - pattern: /docs/grafana-cloud/
      destination: /docs/grafana-cloud/alerting-and-irm/alerting/best-practices/connectivity-errors/
  connectivity-errors-reduce-alert-fatigue:
    - pattern: /docs/grafana/
      destination: /docs/grafana/<GRAFANA_VERSION>/alerting/best-practices/connectivity-errors/#reducing-notification-fatigue-from-datasourceerror-alerts
    - pattern: /docs/grafana-cloud/
      destination: /docs/grafana-cloud/alerting-and-irm/alerting/best-practices/connectivity-errors/
  alert-history:
    - pattern: /docs/grafana/
      destination: /docs/grafana/<GRAFANA_VERSION>/alerting/monitor-status/view-alert-state-history/
    - pattern: /docs/grafana-cloud/
      destination: /docs/grafana-cloud/alerting-and-irm/alerting/monitor-status/view-alert-state-history/
  configure-nodata-and-error-handling:
    - pattern: /docs/grafana/
      destination: /docs/grafana/<GRAFANA_VERSION>/alerting/fundamentals/alert-rule-evaluation/nodata-and-error-states/#modify-the-no-data-or-error-state
    - pattern: /docs/grafana-cloud/
      destination: /docs/grafana-cloud/alerting-and-irm/alerting/fundamentals/alert-rule-evaluation/nodata-and-error-states/#modify-the-no-data-or-error-state
  stale-alert-instances:
    - pattern: /docs/grafana/
      destination: /docs/grafana/<GRAFANA_VERSION>/alerting/fundamentals/alert-rule-evaluation/stale-alert-instances/
    - pattern: /docs/grafana-cloud/
      destination: /docs/grafana-cloud/alerting-and-irm/alerting/fundamentals/alert-rule-evaluation/stale-alert-instances/
  no-data-and-error-alerts:
    - pattern: /docs/grafana/
      destination: /docs/grafana/<GRAFANA_VERSION>/alerting/fundamentals/alert-rule-evaluation/nodata-and-error-states/#no-data-and-error-alerts
    - pattern: /docs/grafana-cloud/
      destination: /docs/grafana-cloud/alerting-and-irm/alerting/fundamentals/alert-rule-evaluation/nodata-and-error-states/#no-data-and-error-alerts
  grafana-state-reason-annotation:
    - pattern: /docs/grafana/
      destination: /docs/grafana/<GRAFANA_VERSION>/alerting/fundamentals/alert-rule-evaluation/nodata-and-error-states/#grafana_state_reason-for-troubleshooting
    - pattern: /docs/grafana-cloud/
      destination: /docs/grafana-cloud/alerting-and-irm/alerting/fundamentals/alert-rule-evaluation/nodata-and-error-states/#grafana_state_reason-for-troubleshooting
---

# Handle missing data in Grafana Alerting

Missing data from when a target stops reporting metric data can be one of the most common issues when troubleshooting alerts. In cloud-native environments, this happens all the time. Pods or nodes scale down to match demand, or an entire job quietly disappears.

When this happens, alerts won’t fire, and you might not notice the system has stopped reporting.

Sometimes it's just a lack of data from a few instances. Other times, it's a connectivity issue where the entire target is unreachable.

This guide covers different scenarios where the underlying data is missing and shows how to design your alerts to act on those cases. If you're troubleshooting an unreachable host or a network failure, see the [Handle connectivity errors documentation](ref:connectivity-errors-guide) as well.

## No Data vs. Missing Series

There are a few common causes when an instance stops reporting data, similar to [connectivity errors](ref:connectivity-errors-guide):

- Host crash: The system is down, and Prometheus stops scraping the target.
- Temporary network failures: Intermittent scrape failures cause data gaps.
- Deployment changes: Decommissioning, Kubernetes pod eviction, or scaling down resources.
- Ephemeral workloads: Metrics intentionally stop reporting.
- And more.

The first thing to understand is the difference between a query failure (or connectivity error), _No Data_, and a _Missing Series_.

Alert queries often return multiple time series — one per instance, pod, region, or label combination. This is known as a **multi-dimensional alert**, meaning a single alert rule can trigger multiple alert instances (alerts).

For example, imagine a recorded metric, `http_request_latency_seconds`, that reports latency per second in the regions where the application is deployed. The query returns one series per region — for instance, `region1` and `region2` — and generates only two alert instances. In this scenario, you may experience:

- **Connectivity Error** if the alert rule query fails.
- **No Data** if the query runs successfully but returns no data at all.
- **Missing Series** if one or more specific series, which previously returned data, are missing, but other series still return data.

In both _No Data_ and _Missing Series_ cases, the query still technically "works", but the alert won’t fire unless you explicitly configure it to handle these situations.

The following tables illustrate both scenarios using the previous example, with an alert that triggers if the latency exceeds 2 seconds in any region: `avg_over_time(http_request_latency_seconds[5m]) > 2`.

**No Data Scenario:** The query returns no data for any series:

| Time  | region1    | region2    | Alert triggered              |
| :---- | :--------- | :--------- | :--------------------------- |
| 00:00 | 1.5s 🟢    | 1s 🟢      | ✅ No Alert                  |
| 01:00 | No Data ⚠️ | No Data ⚠️ | ⚠️ No Alert (Silent Failure) |
| 02:00 | 1.4s 🟢    | 1s 🟢      | ✅ No Alert                  |

**MissingSeries Scenario:** Only a specific series (`region2`) disappears:

| Time  | region1 | region2           | Alert triggered              |
| :---- | :------ | :---------------- | :--------------------------- |
| 00:00 | 1.5s 🟢 | 1s 🟢             | ✅ No Alert                  |
| 01:00 | 1.6s 🟢 | Missing Series ⚠️ | ⚠️ No Alert (Silent Failure) |
| 02:00 | 1.4s 🟢 | 1s 🟢             | ✅ No Alert                  |

In both cases, something broke silently.

## Detect missing data in Prometheus

Prometheus doesn't fire alerts when the query returns no data. It simply assumes there was nothing to report, like with query errors. Missing data won’t trigger existing alerts unless you explicitly check for it.

In Prometheus, a common way to catch missing data is by to use the `absent_over_time` function.

`absent_over_time(http_request_latency_seconds[5m]) == 1`

This triggers when all series for `http_request_latency_seconds` are absent for 5 minutes — catching the _No Data_ case when the entire metric disappears.

However, `absent_over_time()` can’t detect which specific series are missing since it doesn’t preserve labels. The alert won’t tell you which series stopped reporting, only that the query returns no data.

If you want to check for missing data per-region or label, you can specify the label in the alert query as follows:

```promQL
# Detect missing data in region1
absent_over_time(http_request_latency_seconds{region="region1"}[5m]) == 1

# Detect missing data in region2
absent_over_time(http_request_latency_seconds{region="region2"}[5m]) == 1
```

But this doesn't scale well. It is unreliable to have hard-coded queries for each label set, especially in dynamic cloud environments where instances can appear or disappear at any time.

To detect when a specific target has disappeared, see below **Evict alert instances for missing series** for details on how Grafana handles this case and how to set up detection.

## Manage No Data issues in Grafana alerts

While Prometheus provides functions like `absent_over_time()` to detect missing data, not all data sources — like Graphite, InfluxDB, PostgreSQL, and others — available to Grafana alerts support a similar function.

To handle this, Grafana Alerting implements a built-in `No Data` state logic, so you don’t need to detect missing data with `absent_*` queries. Instead, you can configure in the alert rule settings how alerts behave when no data is returned.

Similar to error handling, Grafana triggers a special _No data_ alert by default and lets you control this behavior. In [**Configure no data and error handling**](ref:configure-nodata-and-error-handling), click **Alert state if no data or all values are null**, and choose one of the following options:

- **No Data (default):** Triggers a new `DatasourceNoData` alert, treating _No data_ as a specific problem.
- **Alerting:** Transition each existing alert instance into the `Alerting` state when data disappears.
- **Normal:** Ignores missing data and transitions all instances to the `Normal` state. Useful when receiving intermittent data, such as from experimental services, sporadic actions, or periodic reports.
- **Keep Last State:** Leaves the alert in its previous state until the data returns. This is common in environments where brief metric gaps happen regularly, like with flaky exporters or noisy environments.

  {{< figure src="/media/docs/alerting/alert-rule-configure-no-data.png" alt="A screenshot of the `Configure no data handling` option in Grafana Alerting." max-width="500px" >}}

### Manage DatasourceNoData notifications

When Grafana triggers a [NoData alert](ref:no-data-and-error-alerts), it creates a distinct alert instance, separate from the original alert instance. These alerts behave differently:

- They use a dedicated `alertname: DatasourceNoData`.
- They don’t inherit all the labels from the original alert instances.
- They trigger immediately, ignoring the pending period.

Because of this, `DatasourceNoData` alerts might require a dedicated setup to handle their notifications. For general recommendations, see [Reduce redundant DatasourceError alerts](ref:connectivity-errors-reduce-alert-fatigue) — similar practices can apply to _NoData_ alerts.

## Evict alert instances for missing series

_MissingSeries_ occurs when only some series disappear but not all. This case is subtle, but important.

Grafana marks missing series as [**stale**](ref:stale-alert-instances) after two evaluation intervals and triggers the alert instance eviction process. Here’s what happens under the hood:

- Alert instances with missing data keep their last state for two evaluation intervals.
- If the data is still missing after that:
  - Grafana adds the annotation `grafana_state_reason: MissingSeries`.
  - The alert instance transitions to the `Normal` state.
  - A **resolved notification** is sent if the alert was previously firing.
  - The **alert instance is removed** from the Grafana UI.

If an alert instance becomes stale, you’ll find it in the [alert history](ref:alert-history) as `Normal (Missing Series)` before it disappears. This table shows the eviction process from the previous example:

| Time  | region1               | region2                               | Alert triggered                                                          |
| :---- | :-------------------- | :------------------------------------ | :----------------------------------------------------------------------- |
| 00:00 | 1.5s 🟢               | 1s 🟢                                 | 🟢🟢 No Alerts                                                           |
| 01:00 | 3s 🔴 <br> `Alerting` | 3s 🔴 <br> `Alerting`                 | 🔴🔴 Alert instances triggered for both regions                          |
| 02:00 | 1.6s 🟢               | `(MissingSeries)`⚠️ <br> `Alerting` ️ | 🟢🔴 Region2 missing, state maintained.                                  |
| 03:00 | 1.4s 🟢               | `(MissingSeries)` <br> `Normal`       | 🟢🟢 `region2` was resolved, 📩 notification sent, and instance evicted. |
| 04:00 | 1.4s 🟢               | —                                     | 🟢 No Alerts. `region2` was evicted.                                     |

### Why doesn’t MissingSeries match No Data behavior?

In dynamic environments, such as autoscaling groups, ephemeral pods, spot instances, series naturally come and go. **MissingSeries** normally signals infrastructure or deployment changes.

By default, **No Data** triggers an alert to indicate a potential problem.

The eviction process for **MissingSeries** is designed to prevent alert flapping when a pod or instance disappears, reducing alert noise.

In environments with frequent scale events, prioritize symptom-based alerts over individual infrastructure signals and use aggregate alerts unless you explicitly need to track individual instances.

### Handle MissingSeries notifications

A stale alert instance triggers a **resolved notification** if it transitions from a firing state (such as `Alerting`, `No Data`, or `Error`) to `Normal`, and the [`grafana_state_reason` annotation](ref:grafana-state-reason-annotation) is set to **MissingSeries** to indicate that the alert wasn’t resolved by recovery but evicted because the series data went missing.

Recognizing these notifications helps you handle them appropriately. For example:

- Display the `grafana_state_reason` annotation to clearly identify **MissingSeries** alerts.
- Or use the `grafana_state_reason` annotation to process these alerts differently.

Also, review these notifications to confirm whether something broke or if the alert was unnecessary. To reduce noise:

- Silence or mute alerts during planned maintenance or rollouts.
- Adjust alert rules to avoid triggering on series you expect to come and go, and use aggregated alerts instead.

### Detect missing series in Prometheus

Previously, an example showed how to detect missing data for a specific label, such as `region`:

```promQL
# Detect missing data in region1
absent_over_time(http_request_latency_seconds{region="region1"}[5m]) == 1

# Detect missing data in region2
absent_over_time(http_request_latency_seconds{region="region2"}[5m]) == 1
```

However, this approach doesn’t scale well because it requires hardcoding all possible `region` values.

As an alternative, you can create an alert rule that detects missing series dynamically using the `present_over_time` function:

```promQL
present_over_time(http_request_latency_seconds{}[24h])
unless
present_over_time(http_request_latency_seconds{}[10m])
```

Or, if you want to group by a label such as region:

```promQL
group(present_over_time(http_request_latency_seconds{}[24h])) by (region)
unless
group(present_over_time(http_request_latency_seconds{}[10m])) by (region)
```

This query finds regions (or other targets) that were present at any time in the past 24 hours but have not been present in the past 10 minutes. The alert rule then triggers an alert instance for each missing region. You can apply the same technique to any label or target dimension.

## Conclusion

Missing data isn’t always a failure. It’s a common scenario in dynamic environments when certain targets stop reporting.

Grafana Alerting handles distinct scenarios automatically. Here’s how to think about it:

- Understand `DatasourceNoData` and `MissingSeries` notifications, since they don’t behave like regular alerts.
- Use Grafana’s _No Data_ handling options to define what happens when a query returns nothing.
- When _NoData_ is not an issue, consider rewriting the query to always return data — for example, in Prometheus, use `your_metric_query OR on() vector(0)` to return `0` when `your_metric_query` returns nothing.
- Use `absent_over_time()` or `present_over_time` in Prometheus to detect when a metric or target disappears.
- If data is frequently missing due to scrape delays, use techniques to account for data delays:
  - Adjust the **Time Range** query option in Grafana to evaluate slightly behind real time (e.g., set **To** to `now-1m`) to account for late data points.
  - In Prometheus, you can use `last_over_time(metric_name[10m])` to pick the most recent sample within a given window.
- Don’t alert on every instance by default. In dynamic environments, it’s better to aggregate and alert on symptoms — unless a missing individual instance directly impacts users.
- If you’re getting too much noise from disappearing data, consider adjusting alerts, using `Keep Last State`, or routing those alerts differently.
- For connectivity issues involving alert query failures, see the sibling guide: [Handling connectivity errors in Grafana Alerting](ref:connectivity-errors-guide).
