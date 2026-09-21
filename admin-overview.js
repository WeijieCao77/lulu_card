export async function luluMetrics(sql, days = 30) {
  days = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;

  const [dailyResult, retentionResult, durationResult, screenResult] = await Promise.all([
    sql`
      with today as (select (now() at time zone 'Asia/Shanghai')::date as d),
      window_start as (
        select (d - (greatest(${days},14) - 1) * interval '1 day')::date as ws
        from today
      ),
      date_series as (
        select generate_series(ws, d, '1 day')::date as day
        from window_start, today
      ),
      daily_events as (
        select (ts at time zone 'Asia/Shanghai')::date as day,
               count(distinct visitor_id)::int as active_visitors,
               count(distinct session_id)::int as sessions,
               count(*) filter (where name = 'session_start')::int as page_views
        from events
        where ts >= (select (ws::timestamp at time zone 'Asia/Shanghai') from window_start)
          and ts < (select ((d + interval '1 day')::timestamp at time zone 'Asia/Shanghai') from today)
        group by 1
      ),
      firsts as (
        select visitor_id, min((ts at time zone 'Asia/Shanghai')::date) as first_day
        from events
        group by visitor_id
      ),
      daily_new as (
        select first_day as day, count(distinct visitor_id)::int as new_visitors
        from firsts
        group by first_day
      )
      select coalesce(jsonb_agg(jsonb_build_object(
               'day', to_char(ds.day, 'YYYY-MM-DD'),
               'new_visitors', coalesce(dn.new_visitors,0),
               'active_visitors', coalesce(de.active_visitors,0),
               'sessions', coalesce(de.sessions,0),
               'page_views', coalesce(de.page_views,0)
             ) order by ds.day), '[]'::jsonb) as daily
      from date_series ds
      left join daily_events de on de.day = ds.day
      left join daily_new dn on dn.day = ds.day
    `,

    sql`
      with today as (select (now() at time zone 'Asia/Shanghai')::date as d),
      window_start as (
        select (d - (${days}::int - 1) * interval '1 day')::date as ws
        from today
      ),
      firsts as (
        select visitor_id, min((ts at time zone 'Asia/Shanghai')::date) as cohort
        from events
        group by visitor_id
      ),
      active as (
        select distinct visitor_id, (ts at time zone 'Asia/Shanghai')::date as day
        from events
      )
      select to_char(f.cohort, 'YYYY-MM-DD') as cohort,
             count(distinct f.visitor_id)::int as size,
             case when t.d - f.cohort > 1 then count(distinct a1.visitor_id)::int end as d1,
             case when t.d - f.cohort > 3 then count(distinct a3.visitor_id)::int end as d3,
             case when t.d - f.cohort > 7 then count(distinct a7.visitor_id)::int end as d7
      from firsts f
      cross join today t
      left join active a1 on a1.visitor_id = f.visitor_id and a1.day = f.cohort + 1
      left join active a3 on a3.visitor_id = f.visitor_id and a3.day = f.cohort + 3
      left join active a7 on a7.visitor_id = f.visitor_id and a7.day = f.cohort + 7
      where f.cohort >= (select ws from window_start)
      group by f.cohort, t.d
      order by f.cohort
    `,

    sql`
      with today as (select (now() at time zone 'Asia/Shanghai')::date as d),
      window_start as (
        select (d - (${days}::int - 1) * interval '1 day')::date as ws
        from today
      ),
      effective_events as (
        select e.session_id, e.visitor_id,
               (e.ts at time zone 'Asia/Shanghai')::date as day,
               (case when jsonb_typeof(e.props->'active_s') = 'number' then (e.props->>'active_s')::numeric end) as active_s
        from events e
        where e.name in ('session_end','session_ping')
          and e.ts >= (select (ws - interval '1 day')::timestamp at time zone 'Asia/Shanghai' from window_start)
          and e.ts < (select (d + interval '1 day')::timestamp at time zone 'Asia/Shanghai' from today)
          and jsonb_typeof(e.props->'active_s') = 'number'
          and (case when jsonb_typeof(e.props->'active_s') = 'number' then (e.props->>'active_s')::numeric end) between 0 and 86400
      ),
      session_daily_max as (
        select session_id, visitor_id, day, max(active_s) as day_max
        from effective_events
        group by session_id, visitor_id, day
      ),
      session_daily_delta as (
        select session_id, visitor_id, day,
               greatest(day_max - lag(day_max,1,0) over (partition by session_id order by day), 0) as delta
        from session_daily_max
      ),
      device_days as (
        select visitor_id, day, sum(delta) as active_s
        from session_daily_delta
        where day >= (select ws from window_start) and day <= (select d from today)
        group by visitor_id, day
      ),
      device_totals as (
        select visitor_id, sum(active_s) as total_active_s
        from device_days
        group by visitor_id
      ),
      daily_totals as (
        select day, sum(active_s) as daily_active_s
        from device_days
        group by day
      )
      select
        coalesce((select sum(daily_active_s) from daily_totals),0)::float8 as total_active_s,
        coalesce((select avg(total_active_s) from device_totals),0)::float8 as avg_device_active_s,
        coalesce((select percentile_cont(0.5) within group (order by total_active_s) from device_totals),0)::float8 as median_device_active_s,
        coalesce((select avg(active_s) from device_days),0)::float8 as avg_daily_active_s,
        coalesce((select percentile_cont(0.5) within group (order by active_s) from device_days),0)::float8 as median_daily_active_s
    `,

    sql`
      with last_screen as (
        select distinct on (visitor_id) visitor_id, (case when jsonb_typeof(props->'w') = 'number' then (props->>'w')::numeric end) as w
        from events
        where name = 'session_start'
          and ts >= (((now() at time zone 'Asia/Shanghai')::date - (${days}::int - 1))::timestamp at time zone 'Asia/Shanghai')
          and props ? 'w'
          and jsonb_typeof(props->'w') = 'number'
          and (case when jsonb_typeof(props->'w') = 'number' then (props->>'w')::numeric end) between 0 and 10000
        order by visitor_id, ts desc
      ),
      bucketed as (
        select case
                 when w < 400 then '<400'
                 when w between 400 and 767 then '400-767'
                 when w between 768 and 1199 then '768-1199'
                 else '1200+'
               end as width
        from last_screen
      )
      select width, count(*)::int as n
      from bucketed
      group by width
      order by case width when '<400' then 1 when '400-767' then 2 when '768-1199' then 3 else 4 end
    `
  ]);

  const daily = dailyResult[0]?.daily || [];
  const today = daily.length > 0 ? daily[daily.length - 1] : { day: '', new_visitors: 0, active_visitors: 0, sessions: 0, page_views: 0 };
  const retention = retentionResult.map(r => ({
    cohort: r.cohort,
    size: r.size,
    d1: r.d1,
    d3: r.d3,
    d7: r.d7
  }));
  const deviceDuration = durationResult[0] || {
    total_active_s: 0,
    avg_device_active_s: 0,
    median_device_active_s: 0,
    avg_daily_active_s: 0,
    median_daily_active_s: 0
  };
  const screenWidths = screenResult.map(r => ({ width: r.width, n: r.n }));

  return {
    ok: true,
    days,
    today: {
      new_devices: today.new_visitors,
      active_visitors: today.active_visitors,
      sessions: today.sessions,
      page_views: today.page_views
    },
    daily: daily.map(d => ({
      day: d.day,
      new_visitors: d.new_visitors,
      active_visitors: d.active_visitors,
      sessions: d.sessions,
      page_views: d.page_views
    })),
    retention,
    deviceDuration,
    screenWidths
  };
}