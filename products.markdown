---
layout: default
title: Products
permalink: /products/
wide: true
---
{%- comment -%}
  中身は _data/products.yml に書く。
  件数・制作年の範囲・カテゴリのボタンは、データから自動で作られる。
{%- endcomment -%}
{%- assign products = site.data.products -%}
{%- assign years = "" | split: "" -%}
{%- assign categories = "" | split: "" -%}
{%- for product in products -%}
  {%- assign year = product.period | slice: 0, 4 -%}
  {%- assign years = years | push: year -%}
  {%- if product.categories -%}
    {%- assign categories = categories | concat: product.categories -%}
  {%- endif -%}
{%- endfor -%}
{%- assign years = years | uniq | sort -%}
{%- assign categories = categories | uniq | sort_natural -%}

<div class="products-page">
  <div class="products-backdrop" aria-hidden="true">PRODUCTS</div>

  <header class="page-intro products-intro">
    <div class="products-intro-text">
      <h1 class="page-title">Products</h1>
      <p class="page-lead">個人開発やハッカソンで制作したプロダクト・ツールをまとめています。</p>
    </div>
    <p class="products-summary">
      <span class="products-summary-count"><strong>{{ products.size }}</strong> {% if products.size == 1 %}Product{% else %}Products{% endif %}</span>
      {%- if years.size > 0 %}
      <span>{{ years.first }}{% if years.size > 1 %} — {{ years.last }}{% endif %}</span>
      {%- endif %}
    </p>
  </header>

  {% if categories.size > 0 %}
  <div class="products-filter" role="group" aria-label="カテゴリで絞り込み" data-products-filter hidden>
    <button type="button" data-filter="all" aria-pressed="true">All<span class="products-filter-count">{{ products.size }}</span></button>
    {%- for category in categories %}
    {%- assign category_size = products | where: "categories", category | size %}
    <button type="button" data-filter="{{ category | escape }}" aria-pressed="false">{{ category | escape }}<span class="products-filter-count">{{ category_size }}</span></button>
    {%- endfor %}
  </div>
  {% endif %}

  <div class="products-grid">
    {% for product in products %}
    <article class="products-card" aria-labelledby="product-{{ forloop.index }}" data-categories="{{ product.categories | join: '|' | escape }}">
      {% if product.image %}
      <div class="products-card-thumb">
        <img src="{{ product.image.src | relative_url }}" alt="{{ product.image.alt | escape }}" width="{{ product.image.width }}" height="{{ product.image.height }}"{% if forloop.index > 2 %} loading="lazy"{% endif %} decoding="async">
      </div>
      {% endif %}

      <div class="products-card-body">
        <div class="products-card-header">
          <h2 id="product-{{ forloop.index }}">{{ product.title | escape }}</h2>
          {% if product.period %}<p class="products-card-period">{{ product.period | escape }}</p>{% endif %}
        </div>

        {% if product.description %}
        <p class="products-card-description">{{ product.description | escape }}</p>
        {% endif %}

        {% if product.event or product.role or product.achievements %}
        <div class="products-card-context">
          {% if product.event or product.role %}
          <p class="products-card-event">
            {%- if product.event -%}
              <span>
              {%- if product.event.url -%}
              <a href="{{ product.event.url | escape }}">{{ product.event.name | escape }}</a>
              {%- else -%}
              {{ product.event.name | default: product.event | escape }}
              {%- endif -%}
              </span>
            {%- endif -%}
            {%- if product.role -%}<span>{{ product.role | escape }}</span>{%- endif -%}
          </p>
          {% endif %}
          {% if product.achievements %}
          <ul class="products-card-achievements" aria-label="受賞">
            {% for achievement in product.achievements %}
            <li class="award">
              {%- if achievement.url -%}
              <a href="{{ achievement.url | escape }}">{{ achievement.label | escape }}</a>
              {%- else -%}
              {{ achievement.label | default: achievement | escape }}
              {%- endif -%}
            </li>
            {% endfor %}
          </ul>
          {% endif %}
        </div>
        {% endif %}

        {% if product.tags %}
        <ul class="products-tags" aria-label="使用技術">
          {% for tag in product.tags %}
          <li>{{ tag | escape }}</li>
          {% endfor %}
        </ul>
        {% endif %}

        {% if product.links %}
        <ul class="products-links" aria-label="関連リンク">
          {% for link in product.links %}
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
</div>
