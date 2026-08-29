package com.globalaffairs.handover.domain;

/**
 * Where a real date lands inside the academic year, or all-null when it falls outside it.
 *
 * <p>Port of the {@code Today} type in {@code app/org-data.ts}.
 */
public record Today(Integer week, Integer month, Integer day) {

    public static final Today NONE = new Today(null, null, null);

    public boolean insideYear() {
        return week != null;
    }
}
