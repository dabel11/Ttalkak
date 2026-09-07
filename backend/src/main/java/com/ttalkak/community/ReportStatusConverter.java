package com.ttalkak.community;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class ReportStatusConverter
        implements AttributeConverter<ReportStatus, String> {

    @Override
    public String convertToDatabaseColumn(
            ReportStatus attribute
    ) {
        return attribute == null
                ? ReportStatus.PENDING.value()
                : attribute.value();
    }

    @Override
    public ReportStatus convertToEntityAttribute(
            String databaseValue
    ) {
        if (databaseValue == null || databaseValue.isBlank()) {
            return ReportStatus.PENDING;
        }

        return ReportStatus.fromValue(databaseValue);
    }
}
