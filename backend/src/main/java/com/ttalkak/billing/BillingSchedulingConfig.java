package com.ttalkak.billing;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.context.annotation.Bean;
import java.time.Clock;

@Configuration
@EnableScheduling
class BillingSchedulingConfig {
    @Bean Clock billingClock() { return Clock.systemUTC(); }
}
