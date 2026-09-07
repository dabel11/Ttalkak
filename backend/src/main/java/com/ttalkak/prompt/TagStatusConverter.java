package com.ttalkak.prompt;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class TagStatusConverter
        implements AttributeConverter<TagStatus, String> {

    @Override
    public String convertToDatabaseColumn(TagStatus attribute) {
        return attribute == null
                ? TagStatus.APPROVED.value()
                : attribute.value();
    }

    @Override
    public TagStatus convertToEntityAttribute(String databaseValue) {
        if (databaseValue == null || databaseValue.isBlank()) {
            return TagStatus.APPROVED;
        }

        return TagStatus.fromValue(databaseValue);
    }
}
