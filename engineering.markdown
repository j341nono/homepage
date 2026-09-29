---
layout: default
title: Engineering
permalink: /engineering/
---

<header class="page-intro">
  <h1 class="page-title">開発プロジェクト</h1>
  <p class="page-lead">個人開発やハッカソンで制作したプロダクト・ツールをまとめています。</p>
</header>

<div class="engineering-projects">
  {% for project in site.data.engineering_projects %}
  {%- assign slide_count = project.screenshots.size -%}
  <article class="engineering-project" aria-labelledby="project-{{ forloop.index }}">
    {% if slide_count > 0 %}
    <div class="engineering-carousel"{% if slide_count > 1 %} data-carousel role="region" aria-roledescription="carousel" aria-label="{{ project.title | escape }} のスクリーンショット" tabindex="0"{% endif %}>
      {% for shot in project.screenshots %}
      <div class="engineering-carousel-slide"{% if slide_count > 1 %} role="group" aria-roledescription="slide" aria-label="{{ forloop.index }} / {{ slide_count }}"{% endif %}{% unless forloop.first %} hidden{% endunless %}>
        <img src="{{ shot.src | relative_url }}" alt="{{ shot.alt | escape }}" width="{{ shot.width }}" height="{{ shot.height }}"{% unless forloop.first %} loading="lazy"{% endunless %} decoding="async">
      </div>
      {% endfor %}
      {% if slide_count > 1 %}
      <div class="engineering-carousel-controls">
        <button class="engineering-carousel-arrow" type="button" data-carousel-prev aria-label="前の画像">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <button class="engineering-carousel-arrow" type="button" data-carousel-next aria-label="次の画像">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M9 18l6-6-6-6"/></svg>
        </button>
        <div class="engineering-carousel-dots" role="group" aria-label="表示する画像">
          {% for shot in project.screenshots %}
          <button type="button" data-slide-index="{{ forloop.index0 }}" aria-label="{{ forloop.index }} 枚目を表示"></button>
          {% endfor %}
        </div>
      </div>
      {% endif %}
    </div>
    {% endif %}

    <div class="engineering-project-body">
      <h2 id="project-{{ forloop.index }}">{{ project.title | escape }}</h2>
      {% if project.period or project.role %}
      <p class="engineering-meta">
        {%- if project.period -%}<span>{{ project.period | escape }}</span>{%- endif -%}
        {%- if project.role -%}<span>{{ project.role | escape }}</span>{%- endif -%}
      </p>
      {% endif %}
      {% if project.description %}
      <p class="engineering-description">{{ project.description | escape }}</p>
      {% endif %}
      {% if project.event or project.achievements %}
      <dl class="engineering-facts">
        {% if project.event %}
        <dt>制作</dt>
        <dd>
          {%- if project.event.url -%}
          <a href="{{ project.event.url | escape }}">{{ project.event.name | escape }}</a>
          {%- else -%}
          {{ project.event.name | default: project.event | escape }}
          {%- endif -%}
        </dd>
        {% endif %}
        {% if project.achievements %}
        <dt>受賞</dt>
        <dd>
          <ul class="engineering-achievements">
            {% for achievement in project.achievements %}
            <li class="award">
              {%- if achievement.url -%}
              <a href="{{ achievement.url | escape }}">{{ achievement.label | escape }}</a>
              {%- else -%}
              {{ achievement.label | default: achievement | escape }}
              {%- endif -%}
            </li>
            {% endfor %}
          </ul>
        </dd>
        {% endif %}
      </dl>
      {% endif %}
      {% if project.tags %}
      <ul class="engineering-tags" aria-label="使用技術">
        {% for tag in project.tags %}
        <li>{{ tag | escape }}</li>
        {% endfor %}
      </ul>
      {% endif %}
      {% if project.links %}
      <ul class="engineering-links" aria-label="関連リンク">
        {% for link in project.links %}
        <li>
          <a href="{{ link.url | escape }}">
            {{- link.label | escape -}}
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M7 17 17 7M8 7h9v9"/></svg>
          </a>
        </li>
        {% endfor %}
      </ul>
      {% endif %}
    </div>
  </article>
  {% endfor %}
</div>
