exports.up = async function (knex) {
  try {
    await knex.schema.raw(`
       DROP FUNCTION IF EXISTS public.fs_watch_stats_over_time(integer);

       CREATE OR REPLACE FUNCTION public.fs_watch_stats_over_time(
	days integer)
    RETURNS TABLE("Date" date, "Count" bigint, "Duration" bigint, "Library" text, "LibraryID" text) 
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE PARALLEL UNSAFE
    ROWS 1000

AS $BODY$
      BEGIN
        RETURN QUERY
        SELECT 
          dates."Date",
          COALESCE(counts."Count", 0) AS "Count",
          COALESCE(counts."Duration", 0) AS "Duration",
          l."Name" as "Library",
	      l."Id" as "LibraryID"
        FROM 
          (SELECT generate_series(
            DATE_TRUNC('day', NOW() - CAST(days || ' days' as INTERVAL)),
            DATE_TRUNC('day', NOW()),
            '1 day')::DATE AS "Date"
          ) dates
          CROSS JOIN jf_libraries l

          LEFT JOIN 
            (SELECT 
              DATE_TRUNC('day', a."ActivityDateInserted")::DATE AS "Date",
              COUNT(*) AS "Count",
              (SUM(a."PlaybackDuration") / 60)::bigint AS "Duration",
              l."Name" as "Library"
            FROM 
              jf_playback_activity a
              JOIN jf_library_items i ON i."Id" = a."NowPlayingItemId"
              JOIN jf_libraries l ON i."ParentId" = l."Id" 
            WHERE 
              a."ActivityDateInserted" BETWEEN NOW() - CAST(days || ' days' as INTERVAL) AND NOW()
			  
            GROUP BY 
              l."Name", DATE_TRUNC('day', a."ActivityDateInserted")
            ) counts 
            ON counts."Date" = dates."Date" AND counts."Library" = l."Name"
		    where	l.archived=false

        ORDER BY 
          "Date", "Library";
      END;
      
$BODY$;

ALTER FUNCTION public.fs_watch_stats_over_time(integer)
     OWNER TO "${process.env.POSTGRES_ROLE}";
    `);
  } catch (error) {
    console.error(error);
  }
};

exports.down = async function (knex) {
  try {
    await knex.schema.raw(`
       DROP FUNCTION IF EXISTS public.fs_watch_stats_over_time(integer);

       CREATE OR REPLACE FUNCTION fs_watch_stats_over_time(
        days integer
      )
      RETURNS TABLE(
        "Date" date,
        "Count" bigint,
        "Library" text
      ) 
      LANGUAGE 'plpgsql'
      COST 100
      VOLATILE PARALLEL UNSAFE
      ROWS 1000
  
      AS $BODY$
      BEGIN
        RETURN QUERY
        SELECT 
          dates."Date",
          COALESCE(counts."Count", 0) AS "Count",
          l."Name" as "Library"
        FROM 
          (SELECT generate_series(
            DATE_TRUNC('day', NOW() - CAST(days || ' days' as INTERVAL)),
            DATE_TRUNC('day', NOW()),
            '1 day')::DATE AS "Date"
          ) dates
          CROSS JOIN jf_libraries l
          LEFT JOIN 
            (SELECT 
              DATE_TRUNC('day', a."ActivityDateInserted")::DATE AS "Date",
              COUNT(*) AS "Count",
              l."Name" as "Library"
            FROM 
              jf_playback_activity a
              JOIN jf_library_items i ON i."Id" = a."NowPlayingItemId"
              JOIN jf_libraries l ON i."ParentId" = l."Id"
            WHERE 
              a."ActivityDateInserted" BETWEEN NOW() - CAST(days || ' days' as INTERVAL) AND NOW()
            GROUP BY 
              l."Name", DATE_TRUNC('day', a."ActivityDateInserted")
            ) counts 
            ON counts."Date" = dates."Date" AND counts."Library" = l."Name"
        ORDER BY 
          "Date", "Library";
      END;
      $BODY$;
  
      ALTER FUNCTION fs_watch_stats_over_time(integer)
        OWNER TO "${process.env.POSTGRES_ROLE}";`);
  } catch (error) {
    console.error(error);
  }
};
