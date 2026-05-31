package com.ttalkak.prompt;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PromptTemplateRepository extends JpaRepository<PromptTemplate, Long> {

    List<PromptTemplate> findByIsOfficialTrueOrderByIdAsc();
}
